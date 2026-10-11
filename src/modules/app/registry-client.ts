import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { httpError } from '../../lib/errors';

export function isPublicRegistryAddress(address: string) {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only global unicast IPv6; exclude documentation and transition networks.
  return (
    isIP(address) === 6 &&
    /^[23]/.test(address) &&
    !/^2001:(?::|0{1,4}:|0*db8:)/i.test(address) &&
    !/^3fff:/i.test(address) &&
    !/^2002:/i.test(address)
  );
}
type RegistryResponse = { status: number; headers: Headers; body: Buffer };
export type RegistryTransport = (
  url: URL,
  headers: Record<string, string>,
) => Promise<RegistryResponse>;

/** DNS is checked in the socket lookup itself, so a second lookup cannot rebind to the LAN. */
export const registryTransport: RegistryTransport = (url, headers) =>
  new Promise((resolve, reject) => {
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      reject(httpError(422, 'Registry requires HTTPS without embedded credentials'));
      return;
    }
    const address = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(address) && !isPublicRegistryAddress(address)) {
      reject(httpError(422, 'Registry destination is not permitted'));
      return;
    }
    const req = request(
      url,
      {
        headers,
        method: 'GET',
        lookup: (hostname, options, callback) => {
          void lookup(hostname, { all: true })
            .then((addresses) => {
              if (!addresses.length || addresses.some((v) => !isPublicRegistryAddress(v.address)))
                throw Error('Non-public registry destination');
              const address = addresses[0]!;
              callback(
                null,
                options.all ? addresses : address.address,
                options.all ? undefined : address.family,
              );
            })
            .catch(() => callback(Error('Registry destination is not permitted'), '', 4));
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        if (Number(res.headers['content-length'] ?? 0) > 2000000) {
          res.destroy();
          reject(httpError(422, 'Registry response exceeds limit'));
          return;
        }
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2000000) {
            res.destroy();
            reject(httpError(422, 'Registry response exceeds limit'));
          } else chunks.push(chunk);
        });
        res.on('error', () => reject(httpError(502, 'Registry response failed')));
        res.on('end', () => {
          const result = new Headers();
          for (const [key, value] of Object.entries(res.headers))
            if (value) result.set(key, Array.isArray(value) ? value.join(', ') : value);
          resolve({ status: res.statusCode ?? 502, headers: result, body: Buffer.concat(chunks) });
        });
      },
    );
    const timeout = setTimeout(() => req.destroy(Error('Registry timeout')), 15000);
    req.on('close', () => clearTimeout(timeout));
    req.on('error', () => reject(httpError(502, 'Registry request failed or timed out')));
    req.end();
  });
const mediaTypes = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
] as const;
const descriptorSchema = z.object({
  mediaType: z.string().min(1),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
});
export class RegistryClient {
  private readonly base: URL;
  private readonly name: string;
  constructor(
    readonly repository: string,
    private readonly credentials?: { username: string; password: string },
    private readonly transport: RegistryTransport = registryTransport,
  ) {
    const slash = repository.indexOf('/');
    const host = repository.slice(0, slash),
      name = repository.slice(slash + 1);
    if (
      slash < 1 ||
      !/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(host) ||
      !host.includes('.') ||
      name.length > 255 ||
      !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(name)
    )
      throw httpError(422, 'Use a fully qualified registry repository without tag or digest');
    try {
      this.base = new URL('https://' + host);
    } catch {
      throw httpError(422, 'Invalid registry host or port');
    }
    if (isIP(this.base.hostname) && !isPublicRegistryAddress(this.base.hostname))
      throw httpError(422, 'Registry destination is not permitted');
    this.name = name;
  }
  private parse(response: RegistryResponse): unknown {
    try {
      return JSON.parse(response.body.toString('utf8')) as unknown;
    } catch {
      throw httpError(502, 'Invalid registry response');
    }
  }
  private async get(path: string) {
    const url = new URL(path, this.base),
      headers = { Accept: mediaTypes.join(', ') };
    let response = await this.transport(url, headers);
    if (response.status === 401) {
      const challenge = response.headers.get('www-authenticate') ?? '';
      let authorization: string;
      if (/^Basic\s/i.test(challenge) && this.credentials) {
        if (this.credentials.username.includes(':'))
          throw httpError(422, 'Invalid registry username');
        authorization =
          'Basic ' +
          Buffer.from(this.credentials.username + ':' + this.credentials.password).toString(
            'base64',
          );
      } else if (/^Bearer\s/i.test(challenge)) {
        const params = Object.fromEntries(
          [...challenge.matchAll(/([a-z]+)="([^"\\]*)"/gi)].map((v) => [
            v[1]!.toLowerCase(),
            v[2]!,
          ]),
        );
        let realm: URL;
        try {
          realm = new URL(params.realm!);
        } catch {
          throw httpError(422, 'Unsupported registry authentication challenge');
        }
        const aliyunPersonal =
          this.base.hostname.endsWith('.personal.cr.aliyuncs.com') &&
          realm.origin === 'https://dockerauth.cn-hangzhou.aliyuncs.com' &&
          realm.pathname === '/auth';
        const dockerHub =
          this.base.origin === 'https://registry-1.docker.io' &&
          realm.origin === 'https://auth.docker.io' &&
          realm.pathname === '/token';
        if (
          realm.protocol !== 'https:' ||
          realm.username ||
          realm.password ||
          realm.hash ||
          (realm.origin !== this.base.origin && !aliyunPersonal && !dockerHub)
        )
          throw httpError(422, 'Registry token service is outside the permitted origin');
        realm.searchParams.set('scope', `repository:${this.name}:pull`);
        if (params.service) realm.searchParams.set('service', params.service);
        const tokenHeaders: Record<string, string> = { Accept: 'application/json' };
        if (this.credentials) {
          if (this.credentials.username.includes(':'))
            throw httpError(422, 'Invalid registry username');
          tokenHeaders.Authorization =
            'Basic ' +
            Buffer.from(this.credentials.username + ':' + this.credentials.password).toString(
              'base64',
            );
        }
        const tokenResponse = await this.transport(realm, tokenHeaders);
        if (tokenResponse.status !== 200)
          throw httpError(422, 'Registry authentication failed; check pull permission');
        const token = z
          .object({
            token: z
              .string()
              .min(1)
              .max(16000)
              .regex(/^[A-Za-z0-9._~+/-]+=*$/)
              .optional(),
            access_token: z
              .string()
              .min(1)
              .max(16000)
              .regex(/^[A-Za-z0-9._~+/-]+=*$/)
              .optional(),
          })
          .parse(this.parse(tokenResponse));
        if (!token.token && !token.access_token) throw httpError(502, 'Registry token is missing');
        authorization = 'Bearer ' + (token.token ?? token.access_token);
      } else throw httpError(422, 'Registry requires a supported pull connection');
      response = await this.transport(url, { ...headers, Authorization: authorization });
    }
    if (response.status !== 200)
      throw httpError(
        422,
        `Registry returned ${response.status}; check repository and pull permission`,
      );
    return response;
  }
  async tags(last?: string) {
    if (last && !/^[\w][\w.-]{0,127}$/.test(last)) throw httpError(422, 'Invalid tag cursor');
    const path = `/v2/${this.name}/tags/list`,
      query = new URLSearchParams({ n: '100', ...(last ? { last } : {}) });
    const response = await this.get(path + '?' + query);
    const value = z
      .object({
        name: z.literal(this.name),
        tags: z
          .array(z.string().regex(/^[\w][\w.-]{0,127}$/))
          .max(100)
          .nullable(),
      })
      .parse(this.parse(response));
    const tags = value.tags ?? [];
    // Do not follow the Link URL: only accept its cursor after validating its origin and path.
    const link = response.headers.get('link')?.match(/^<([^>]+)>;\s*rel="next"$/)?.[1];
    let next: string | null = null;
    if (link) {
      const target = new URL(link, this.base);
      if (target.origin !== this.base.origin || target.pathname !== path)
        throw httpError(422, 'Invalid registry pagination');
      next = target.searchParams.get('last');
      if (!next || next === last || !/^[\w][\w.-]{0,127}$/.test(next))
        throw httpError(422, 'Invalid registry pagination');
    }
    return { repository: this.repository, tags, next };
  }
  async manifest(reference: string) {
    if (!/^(?:sha256:[a-f0-9]{64}|[\w][\w.-]{0,127})$/.test(reference))
      throw httpError(422, 'Invalid image reference');
    const response = await this.get(`/v2/${this.name}/manifests/${encodeURIComponent(reference)}`);
    const digest = 'sha256:' + createHash('sha256').update(response.body).digest('hex');
    if (
      (reference.startsWith('sha256:') && reference !== digest) ||
      (response.headers.get('docker-content-digest') &&
        response.headers.get('docker-content-digest') !== digest)
    )
      throw httpError(422, 'Registry manifest digest does not match content');
    const content = this.parse(response);
    const manifest = z
      .object({
        schemaVersion: z.literal(2),
        mediaType: z.enum(mediaTypes),
      })
      .parse(content);
    if (manifest.mediaType === mediaTypes[1] || manifest.mediaType === mediaTypes[3])
      z.object({ manifests: z.array(descriptorSchema).min(1) }).parse(content);
    else z.object({ config: descriptorSchema, layers: z.array(descriptorSchema) }).parse(content);
    return {
      repository: this.repository,
      reference,
      digest,
      image: this.repository + '@' + digest,
      mediaType: manifest.mediaType,
    };
  }
}
