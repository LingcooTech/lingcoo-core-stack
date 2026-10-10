import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

const root = path.resolve('admin-ui/src');
const files = new Map();
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(tsx?|css)$/.test(file) && !/\.(test|stories)\./.test(file)) {
      files.set(file, await readFile(file, 'utf8'));
    }
  }
}
await scan(root);
function resolveImport(file, specifier) {
  const base = specifier.startsWith('@/')
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(file), specifier)
      : null;
  return base
    ? [base, ...['.ts', '.tsx', '.css', '/index.ts', '/index.tsx'].map((ext) => base + ext)].find(
        (candidate) => files.has(candidate),
      )
    : undefined;
}
const graph = new Map();
for (const [file, source] of files) {
  const imports = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(node) && !node.isTypeOnly)
    ) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text);
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  graph.set(file, imports);
}
function walk(entry) {
  const visited = new Set();
  const packages = new Set();
  function traverse(file) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const specifier of graph.get(file) ?? []) {
      const dependency = resolveImport(file, specifier);
      if (dependency) traverse(dependency);
      else if (!specifier.startsWith('.') && !specifier.startsWith('@/')) packages.add(specifier);
    }
  }
  traverse(entry);
  return {
    files: [...visited].map((file) => path.relative(root, file)).sort(),
    packages: [...packages].sort(),
    legacyUiFiles: [...visited]
      .filter((file) => file.includes('/components/ui/'))
      .map((file) => path.relative(root, file))
      .sort(),
  };
}
const app = files.get(path.join(root, 'App.tsx'));
const routes = [
  ...app.matchAll(
    /path="(\/admin[^"]*)"\s+element=\{\s*<ProtectedAdminSectionRoute\s+sectionKey="([^"]+)"[^>]*>\s*<(\w+)/g,
  ),
].map(([, route, section, page]) => ({ route, section, page }));
routes.push({ route: '/admin/login', section: 'login', page: 'LoginPage' });
const pages = Object.fromEntries(
  [...new Set(routes.map(({ page }) => page))].map((page) => [
    page,
    walk(path.join(root, 'pages', `${page}.tsx`)),
  ]),
);
const report = {
  businessSections: new Set(
    routes.filter(({ section }) => section !== 'login').map(({ section }) => section),
  ).size,
  pageRoutes: routes.length,
  routes,
  pages,
  shell: walk(path.join(root, 'components/layout/Shell.tsx')),
};
if (process.argv.includes('--assets')) {
  const assets = path.resolve('admin-ui/dist/assets');
  report.assets = await Promise.all(
    (await readdir(assets))
      .filter((file) => /\.(js|css)$/.test(file))
      .map(async (file) => {
        const bytes = await readFile(path.join(assets, file));
        return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
      }),
  );
}
const output = process.argv.find((argument) => argument.startsWith('--output='))?.slice(9);
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
else console.info(JSON.stringify(report, null, 2));
