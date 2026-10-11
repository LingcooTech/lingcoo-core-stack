// Portable application CI helper. Requires yaml@2.9.1; no Stack source or runtime imports.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(
  resolve(
    process.env.STACK_PUBLISH_TOOLING_DIR || dirname(fileURLToPath(import.meta.url)),
    'package.json',
  ),
);
const { parseDocument } = require('yaml');
function parse(text) {
  if (Buffer.byteLength(text) > 512000) throw Error('Definition exceeds 500 KB');
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw Error('Invalid JSON/YAML definition');
  return doc.toJS({ maxAliasCount: 0 });
}
export function prepareApplicationRelease({
  definitionFile,
  root,
  imagesFile,
  version,
  commit,
  buildUrl,
}) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(version))
    throw Error('Invalid commit or version');
  const definition = parse(readFileSync(definitionFile, 'utf8'));
  if (
    !definition ||
    typeof definition !== 'object' ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(definition.app?.code)
  )
    throw Error('Invalid application identity');
  if (definition.delivery?.kind === 'compose' && typeof definition.delivery.compose === 'string') {
    const path = definition.delivery.compose;
    if (
      isAbsolute(path) ||
      path.includes('\\') ||
      path.split('/').some((v) => !v || v === '.' || v === '..')
    )
      throw Error('Invalid Compose path');
    const repository = realpathSync(root),
      file = realpathSync(resolve(repository, path)),
      inside = relative(repository, file);
    if (inside.startsWith('..') || isAbsolute(inside))
      throw Error('Compose path escaped repository');
    definition.delivery.compose = parse(readFileSync(file, 'utf8'));
  }
  const images = JSON.parse(readFileSync(imagesFile, 'utf8'));
  if (!images || typeof images !== 'object' || Array.isArray(images))
    throw Error('Invalid image map');
  for (const value of Object.values(images))
    if (typeof value !== 'string' || !/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(value))
      throw Error('Immutable image digest required');
  return { definition, images, version, commit, notes: '', ...(buildUrl ? { buildUrl } : {}) };
}
export async function publishApplicationRelease(options, fetcher = fetch) {
  const body = prepareApplicationRelease(options),
    base = new URL(options.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password)
    throw Error('STACK_API_URL must use HTTPS without embedded credentials');
  if (!/^stk_publish_[A-Za-z0-9_-]{43}$/.test(options.token || ''))
    throw Error('STACK_PUBLISH_TOKEN is missing or invalid');
  let response;
  try {
    response = await fetcher(
      new URL(`/v1/publishing/apps/${body.definition.app.code}/releases`, base),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      },
    );
  } catch {
    throw Error('Stack request failed or timed out');
  }
  if (!response.ok)
    throw Error(
      `Stack registration failed (${response.status}); inspect the application release configuration`,
    );
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error('Invalid Stack registration response');
  }
  if (!result || typeof result.id !== 'string' || result.status !== 'draft')
    throw Error('Unexpected Stack registration response');
  return { id: result.id, version: result.version, status: result.status };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [definitionFile, imagesFile, version, commit] = process.argv.slice(2);
  if (!definitionFile || !imagesFile || !version || !commit)
    throw Error(
      'Usage: node publish-application-release.mjs <app.yaml> <images.json> <version> <commit>',
    );
  const buildUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined;
  console.info(
    JSON.stringify(
      await publishApplicationRelease({
        definitionFile,
        imagesFile,
        version,
        commit,
        root: process.env.GITHUB_WORKSPACE || process.cwd(),
        baseUrl: process.env.STACK_API_URL,
        token: process.env.STACK_PUBLISH_TOKEN,
        buildUrl,
      }),
    ),
  );
}
