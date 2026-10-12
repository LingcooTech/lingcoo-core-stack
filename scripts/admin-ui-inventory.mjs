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
  const ast = ts.createSourceFile(
    file,
    file.endsWith('.css') ? '' : source,
    ts.ScriptTarget.Latest,
    true,
  );
  if (ast.parseDiagnostics.length)
    throw new Error(
      `Cannot parse ${file}: ${ast.parseDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('; ')}`,
    );
  const runtimeImport = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) return true;
      if (clause.isTypeOnly) return false;
      if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings))
        return true;
      return (
        clause.namedBindings.elements.length === 0 ||
        clause.namedBindings.elements.some((item) => !item.isTypeOnly)
      );
    }
    return (
      !node.isTypeOnly &&
      (!node.exportClause ||
        !ts.isNamedExports(node.exportClause) ||
        node.exportClause.elements.length === 0 ||
        node.exportClause.elements.some((item) => !item.isTypeOnly))
    );
  };
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && runtimeImport(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({ specifier: node.moduleSpecifier.text, dynamic: false });
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push({ specifier: node.arguments[0].text, dynamic: true });
    ts.forEachChild(node, visit);
  }
  visit(ast);
  graph.set(file, imports);
}
function walk(entry, includeDynamic = true) {
  if (!files.has(entry)) throw new Error(`Missing runtime entry: ${entry}`);
  const visited = new Set();
  const packages = new Set();
  function traverse(file) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const { specifier, dynamic } of graph.get(file) ?? []) {
      if (dynamic && !includeDynamic) continue;
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
]
  .map(([, route, section, page]) => ({ route, section, page }))
  .filter(({ page }) => !['Navigate', 'LegacyLifecycleRedirect'].includes(page));
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
  shell: walk(path.join(root, 'components/admin/AdminShell.tsx')),
};
const adminPages = new Set(routes.map(({ page }) => page));
const publicPages = [...app.matchAll(/import\('@\/pages\/(\w+)'\)/g)]
  .map(([, page]) => page)
  .filter((page) => !adminPages.has(page));
report.publicRuntime = Object.fromEntries(
  [...new Set(publicPages)].map((page) => [page, walk(path.join(root, 'pages', `${page}.tsx`))]),
);
report.publicEntry = walk(path.join(root, 'main.tsx'), false);
report.publicShells = Object.fromEntries(
  ['UserShell', 'DocsShell'].map((name) => [
    name,
    walk(path.join(root, 'components/layout', `${name}.tsx`)),
  ]),
);
report.portalProvider = walk(path.join(root, 'components/portal/PortalUiProvider.tsx'));
const adminRuntimeFiles = [
  ...new Set([report.shell, ...Object.values(pages)].flatMap((item) => item.files)),
];
report.uiAudit = adminRuntimeFiles
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => {
    const source = files.get(path.join(root, file));
    const nativeControls = [];
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        if (
          ['button', 'input', 'select', 'textarea', 'dialog', 'details', 'summary'].includes(tag)
        ) {
          const typeAttribute = node.attributes.properties.find(
            (property) => ts.isJsxAttribute(property) && property.name.getText(ast) === 'type',
          );
          const type =
            typeAttribute?.initializer && ts.isStringLiteral(typeAttribute.initializer)
              ? typeAttribute.initializer.text
              : undefined;
          nativeControls.push({
            tag,
            ...(type ? { type } : {}),
            line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    return {
      file,
      nativeControls,
      antDesign: (graph.get(path.join(root, file)) ?? []).some(
        ({ specifier }) => specifier === 'antd',
      ),
      // Layout utilities are allowed; this flag makes hand-written business surfaces visible to review.
      customSurface: /className="[^"]*(?:rounded[^" ]*[^\"]*\bborder\b|\bbg-card\b)/.test(source),
    };
  });
if (process.argv.includes('--check')) {
  const failures = [];
  if (routes.length !== 29 || report.businessSections !== 22)
    failures.push('Admin route coverage changed; update the inventory contract explicitly');
  for (const [name, item] of Object.entries({ ...pages, AdminShell: report.shell })) {
    const forbidden = item.packages.filter((dependency) =>
      /^(?:@radix-ui\/|radix-ui(?:\/|$)|sonner(?:\/|$)|react-hook-form(?:\/|$)|@hookform\/resolvers(?:\/|$)|@tanstack\/react-table(?:\/|$))/.test(
        dependency,
      ),
    );
    if (item.legacyUiFiles.length || forbidden.length)
      failures.push(`${name}: ${[...item.legacyUiFiles, ...forbidden].join(', ')}`);
  }
  for (const [name, item] of Object.entries({
    ...report.publicRuntime,
    ...report.publicShells,
    PortalUiProvider: report.portalProvider,
    PublicEntry: report.publicEntry,
  })) {
    const forbidden = item.packages.filter((dependency) =>
      /^(?:antd(?:\/|$)|@ant-design\/)/.test(dependency),
    );
    if (forbidden.length)
      failures.push(`${name} eagerly reaches admin UI: ${forbidden.join(', ')}`);
  }
  for (const item of report.uiAudit) {
    const unsupported = item.nativeControls.filter(
      ({ tag, type }) => tag !== 'input' || type !== 'file',
    );
    if (unsupported.length)
      failures.push(
        `${item.file}: native interactive controls remain: ${JSON.stringify(unsupported)}`,
      );
  }
  const commonUi = report.publicEntry.packages.filter((dependency) =>
    /^(?:antd(?:\/|$)|@ant-design\/|@radix-ui\/|radix-ui(?:\/|$)|sonner(?:\/|$))/.test(dependency),
  );
  if (commonUi.length || report.publicEntry.legacyUiFiles.length)
    failures.push(`Shared entry eagerly loads route-specific UI: ${commonUi.join(', ')}`);
  if (failures.length) throw new Error(`Admin UI boundary violations:\n${failures.join('\n')}`);
  console.info(
    `Verified ${routes.length} admin routes, shell and ${publicPages.length} public pages: no legacy admin UI or public Ant Design imports`,
  );
}
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
else if (!process.argv.includes('--check')) console.info(JSON.stringify(report, null, 2));
