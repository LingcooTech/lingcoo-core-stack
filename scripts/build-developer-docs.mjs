import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'admin-ui/public/developer-docs');
// Explicit public allowlist: never publish credentials, repository trees or arbitrary files.
const documents = [
  ['quickstart', '开发接入指南', 'docs/developer-quickstart.md'],
  ['standard', '接入与交付标准', 'docs/stack-application-definition-standard.md'],
  ['templates', '开发模板与验收', 'templates/stack-app/README.md'],
  ['progress', '实施进度与边界', 'specs/application-lifecycle/tasks.md'],
];
const files = [
  ...documents.map(([, , file]) => file),
  'examples/stack-compose-app.json',
  'examples/stack-publish-workflow.yml',
  'scripts/publish-application-release.mjs',
  'packages/contracts/src/app-lifecycle.ts',
];
const entries = await Promise.all(
  files.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')]),
);
// Fail builds on new unexported local links rather than ship broken documentation.
for (const [file, content] of entries) {
  if (!file.endsWith('.md')) continue;
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|#|\/)/.test(target)) continue;
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), target.split('#')[0]),
    );
    if (!files.includes(resolved))
      throw new Error(`Unpublished documentation link: ${file} -> ${target}`);
  }
}
await rm(output, { recursive: true, force: true });
const items = [];
for (const [file, content] of entries) {
  const target = path.join(output, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  const document = documents.find(([, , source]) => source === file);
  items.push({
    id: document?.[0] ?? file,
    title: document?.[1] ?? path.basename(file),
    path: file,
    url: `/developer-docs/${file}`,
    sha256: createHash('sha256').update(content).digest('hex'),
    ...(document ? { content } : {}),
  });
}
await writeFile(
  path.join(output, 'index.json'),
  JSON.stringify({ schemaVersion: 1, items }, null, 2) + '\n',
);
console.log(
  `Published ${documents.length} developer documents and ${files.length - documents.length} supporting files.`,
);
