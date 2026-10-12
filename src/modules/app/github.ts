import { z } from 'zod';
import { gitSourceSchema, repositoryPathSchema } from '@lingcoo/contracts';
import { httpError } from '../../lib/errors';
import {
  parseApplicationDocument,
  validateApplicationDefinition,
  definitionDigest,
} from './definition';

export class GitHubApplicationReader {
  constructor(
    private readonly token = '',
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private async request(path: string) {
    let response: Response;
    try {
      response = await this.fetcher('https://api.github.com' + path, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      throw httpError(502, 'GitHub request failed or timed out');
    }
    if (!response.ok)
      throw httpError(
        422,
        `GitHub returned ${response.status}; check repository, ref and connection permissions`,
      );
    if (Number(response.headers.get('content-length') ?? 0) > 1000000)
      throw httpError(422, 'GitHub response exceeds limit');
    const reader = response.body?.getReader();
    if (!reader) throw httpError(502, 'Empty GitHub response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1000000) {
          await reader.cancel();
          throw httpError(422, 'GitHub response exceeds limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw httpError(502, 'Invalid GitHub response');
    }
  }
  async repositories(page: number) {
    if (!this.token) throw httpError(422, 'GitHub connection is required to list repositories');
    const rows = z
      .array(
        z.object({
          id: z.number(),
          full_name: z.string(),
          html_url: z.string().regex(/^https:\/\/github\.com\//),
          private: z.boolean(),
          default_branch: z.string(),
          description: z.string().nullable(),
        }),
      )
      .parse(
        await this.request(
          `/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        ),
      );
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        name: r.full_name,
        url: r.html_url,
        private: r.private,
        defaultBranch: r.default_branch,
        description: r.description,
      })),
      nextPage: rows.length === 50 ? page + 1 : null,
    };
  }
  async preview(input: z.input<typeof gitSourceSchema>) {
    const source = gitSourceSchema.parse(input);
    const [owner, name] = source.repository
      .replace(/\/$/, '')
      .replace(/\.git$/, '')
      .split('/')
      .slice(-2);
    const prefix = `/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}`;
    const commit = z
      .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
      .parse(await this.request(`${prefix}/commits/${encodeURIComponent(source.ref)}`)).sha;
    const read = async (path: string) => {
      repositoryPathSchema.parse(path);
      const file = z
        .object({
          type: z.literal('file'),
          encoding: z.literal('base64'),
          size: z.number().max(512000),
          content: z.string().max(750000),
        })
        .parse(
          await this.request(
            `${prefix}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commit}`,
          ),
        );
      return parseApplicationDocument(Buffer.from(file.content, 'base64').toString('utf8'));
    };
    const raw = await read(source.path);
    // Resolve referenced Compose within the same immutable commit, never a download_url.
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const delivery = (raw as Record<string, unknown>).delivery;
      if (delivery && typeof delivery === 'object' && !Array.isArray(delivery)) {
        const values = delivery as Record<string, unknown>;
        if (values.kind === 'compose' && typeof values.compose === 'string')
          values.compose = await read(values.compose);
      }
    }
    const definition = validateApplicationDefinition(raw);
    return {
      definition,
      definitionDigest: definitionDigest(definition),
      source: { ...source, commit },
      warnings: ['导入只创建草稿；销售配置、凭证及真实交付验证需在平台完成。'],
    };
  }
}
