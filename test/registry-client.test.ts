import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  RegistryClient,
  isPublicRegistryAddress,
  registryTransport,
  type RegistryTransport,
} from '../src/modules/app/registry-client';
const manifest = Buffer.from(
  JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: 'sha256:' + 'a'.repeat(64),
      size: 2,
    },
    layers: [],
  }),
);
const digest = 'sha256:' + createHash('sha256').update(manifest).digest('hex');
test('registry destinations exclude private, loopback, metadata, documentation and IPv6 transition networks', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '100.64.0.1',
    '198.18.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2001::1',
    '2001:0000:1::1',
    '3fff::1',
    '2002:a00:1::',
  ])
    assert.equal(isPublicRegistryAddress(ip), false, ip);
  assert.equal(isPublicRegistryAddress('8.8.8.8'), true);
  assert.equal(isPublicRegistryAddress('2606:4700:4700::1111'), true);
  assert.throws(() => new RegistryClient('127.0.0.1/secret'));
  assert.throws(() => new RegistryClient('registry.example/a/../b'));
  await assert.rejects(() => registryTransport(new URL('https://127.0.0.1/v2/'), {}), {
    statusCode: 422,
  });
});
test('registry authentication requests only pull scope, binds credentials to the permitted origin and hashes content', async () => {
  const calls: URL[] = [];
  const transport: RegistryTransport = async (url, headers) => {
    calls.push(url);
    if (url.pathname === '/token') {
      assert.equal(url.searchParams.get('scope'), 'repository:team/app:pull');
      assert.equal(
        headers.Authorization,
        'Basic ' + Buffer.from('robot:private-password').toString('base64'),
      );
      return {
        status: 200,
        headers: new Headers(),
        body: Buffer.from('{"token":"scoped-pull-token"}'),
      };
    }
    if (!headers.Authorization)
      return {
        status: 401,
        headers: new Headers({
          'www-authenticate':
            'Bearer realm="https://registry.example/token",service="registry.example",scope="repository:other:push"',
        }),
        body: Buffer.alloc(0),
      };
    assert.equal(headers.Authorization, 'Bearer scoped-pull-token');
    return {
      status: 200,
      headers: new Headers({ 'docker-content-digest': digest }),
      body: manifest,
    };
  };
  const result = await new RegistryClient(
    'registry.example/team/app',
    { username: 'robot', password: 'private-password' },
    transport,
  ).manifest('1.0.0');
  assert.equal(result.image, 'registry.example/team/app@' + digest);
  assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(result).includes('private-password'));
});
test('registry refuses foreign auth realms, redirects, digest mismatches and foreign pagination without following them', async () => {
  let calls = 0;
  const foreign = new RegistryClient(
    'registry.example/team/app',
    { username: 'robot', password: 'secret' },
    async () => {
      calls++;
      return {
        status: 401,
        headers: new Headers({
          'www-authenticate': 'Bearer realm="https://attacker.example/token"',
        }),
        body: Buffer.alloc(0),
      };
    },
  );
  await assert.rejects(() => foreign.tags(), /permitted origin/);
  assert.equal(calls, 1);
  const client = (headers: Record<string, string>, body = manifest, status = 200) =>
    new RegistryClient('registry.example/team/app', undefined, async () => ({
      status,
      headers: new Headers(headers),
      body,
    }));
  await assert.rejects(
    () => client({ Location: 'https://attacker.example' }, manifest, 302).manifest('latest'),
    /302/,
  );
  await assert.rejects(
    () => client({ 'docker-content-digest': 'sha256:' + 'a'.repeat(64) }).manifest('latest'),
    /digest/,
  );
  await assert.rejects(() => client({}).manifest('sha256:' + 'b'.repeat(64)), /digest/);
  await assert.rejects(
    () =>
      client(
        { link: '<https://attacker.example/v2/team/app/tags/list?last=next>; rel="next"' },
        Buffer.from('{"name":"team/app","tags":["v1"]}'),
      ).tags(),
    /pagination/,
  );
});
test('ACR personal registry uses its known separate auth service and tag pagination stays within the declared repository', async () => {
  const host = 'demo.cn-beijing.personal.cr.aliyuncs.com';
  const client = new RegistryClient(
    host + '/team/app',
    { username: 'robot', password: 'secret' },
    async (url, headers) => {
      if (url.hostname === 'dockerauth.cn-hangzhou.aliyuncs.com') {
        assert.equal(url.pathname, '/auth');
        assert.equal(url.searchParams.get('scope'), 'repository:team/app:pull');
        return {
          status: 200,
          headers: new Headers(),
          body: Buffer.from('{"access_token":"pull"}'),
        };
      }
      if (!headers.Authorization)
        return {
          status: 401,
          headers: new Headers({
            'www-authenticate':
              'Bearer realm="https://dockerauth.cn-hangzhou.aliyuncs.com/auth",service="registry.aliyuncs.com:cn-beijing:123"',
          }),
          body: Buffer.alloc(0),
        };
      return {
        status: 200,
        headers: new Headers({ link: '</v2/team/app/tags/list?n=100&last=v1>; rel="next"' }),
        body: Buffer.from('{"name":"team/app","tags":["v1"]}'),
      };
    },
  );
  assert.deepEqual(await client.tags(), {
    repository: host + '/team/app',
    tags: ['v1'],
    next: 'v1',
  });
  await assert.rejects(() => client.tags('v1'), /pagination/);
});

test('manifest inspection requires OCI descriptors and Docker Hub authentication is restricted to its known token service', async () => {
  const invalid = Buffer.from(
    '{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json"}',
  );
  await assert.rejects(() =>
    new RegistryClient('registry.example/team/app', undefined, async () => ({
      status: 200,
      headers: new Headers(),
      body: invalid,
    })).manifest('latest'),
  );
  const client = new RegistryClient(
    'registry-1.docker.io/library/alpine',
    undefined,
    async (url, headers) => {
      if (url.hostname === 'auth.docker.io') {
        assert.equal(url.searchParams.get('scope'), 'repository:library/alpine:pull');
        assert.equal(headers.Authorization, undefined);
        return {
          status: 200,
          headers: new Headers(),
          body: Buffer.from('{"token":"public-pull"}'),
        };
      }
      if (!headers.Authorization)
        return {
          status: 401,
          headers: new Headers({
            'www-authenticate':
              'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"',
          }),
          body: Buffer.alloc(0),
        };
      return { status: 200, headers: new Headers(), body: manifest };
    },
  );
  assert.equal((await client.manifest('3.22')).digest, digest);
});
