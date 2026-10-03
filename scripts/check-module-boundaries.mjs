import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import ts from 'typescript';
export function collectViolations(root = process.cwd()) {
  const src = resolve(root, 'src'),
    modulesRoot = resolve(src, 'modules'),
    violations = [],
    edges = new Map();
  const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config || {}, ts.sys, root);
  const owners = JSON.parse(readFileSync(resolve(root, 'architecture/table-owners.json'), 'utf8'));
  const walk = (d) =>
    existsSync(d)
      ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? walk(resolve(d, e.name))
            : e.name.endsWith('.ts')
              ? [resolve(d, e.name)]
              : [],
        )
      : [];
  const moduleOf = (f) => {
    const p = relative(modulesRoot, f).split(sep);
    return p[0] !== '..' && p.length > 1 ? p[0] : null;
  };
  const add = (file, rule, detail) =>
    violations.push({ file: relative(root, file).split(sep).join('/'), rule, detail });
  const files = [
    ...walk(src),
    ...walk(resolve(root, 'packages/contracts/src')),
    ...walk(resolve(root, 'packages/api-client/src')),
  ];
  const program = ts.createProgram(files, { ...config.options, noResolve: true, noLib: true });
  const checker = program.getTypeChecker();
  for (const schemaFile of [
    resolve(src, 'db/schema.ts'),
    ...walk(resolve(src, 'db/schema')),
  ].filter(existsSync)) {
    const schemaAst = ts.createSourceFile(
      schemaFile,
      readFileSync(schemaFile, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const inspectTable = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'pgTable' &&
        !owners[node.name.text]
      )
        add(schemaFile, 'table-owner-missing', node.name.text);
      ts.forEachChild(node, inspectTable);
    };
    inspectTable(schemaAst);
  }
  for (const file of files) {
    const source = moduleOf(file),
      ast = program.getSourceFile(file),
      protectedEnvironment =
        Boolean(source) ||
        file.includes('/packages/contracts/src/') ||
        file.includes('/packages/api-client/src/');
    const dependency = (specifier, typeOnly = false) => {
      const target =
        ts.resolveModuleName(specifier, file, config.options, ts.sys).resolvedModule
          ?.resolvedFileName || resolve(dirname(file), specifier + '.ts');
      if (
        file.includes('/packages/contracts/src/') &&
        /fastify|drizzle|react|^pg$|ioredis|src\/lib\/env/.test(specifier)
      )
        add(file, 'contract-infrastructure', specifier);
      if (
        file.includes('/packages/api-client/src/') &&
        /^react|fastify|drizzle|^pg$/.test(specifier)
      )
        add(file, 'client-infrastructure', specifier);
      if (protectedEnvironment && !typeOnly && /(?:^|\/)lib\/env$/.test(specifier))
        add(file, 'module-environment', 'environment-loader-import:' + specifier);
      if (
        file.includes('/packages/') &&
        (target.startsWith(src + sep) ||
          (file.includes('/contracts/src/') && specifier === '@lingcoo/api-client'))
      )
        add(file, 'shared-backend-dependency', specifier);
      const dest = moduleOf(target);
      if (
        source &&
        (target.startsWith(resolve(src, 'composition') + sep) ||
          target.startsWith(resolve(src, 'scripts') + sep) ||
          target === resolve(modulesRoot, 'index.ts'))
      )
        add(file, 'module-composition-dependency', specifier);
      if (source && /\/lib\/[^/]*settings\.ts$/.test(target))
        add(file, 'legacy-settings-import', specifier);
      if (
        dest &&
        source !== dest &&
        !target.endsWith('/public.ts') &&
        !file.startsWith(resolve(src, 'composition') + sep) &&
        !file.startsWith(resolve(src, 'scripts') + sep) &&
        file !== resolve(modulesRoot, 'index.ts')
      )
        add(file, 'internal-import', specifier);
      if (source && dest && source !== dest) {
        if (!typeOnly) {
          if (!edges.has(source)) edges.set(source, new Set());
          edges.get(source).add(dest);
        }
      }
      if (file.includes('/platform/') && dest) add(file, 'platform-business-dependency', specifier);
      if (
        file.includes('/domain/') &&
        /fastify|drizzle|ioredis|^pg$|\/lib\/env|repository|infrastructure/.test(specifier)
      )
        add(file, 'domain-dependency', specifier);
      if (
        file.endsWith('/public.ts') &&
        /repository/.test(specifier) &&
        !typeOnly &&
        ast.statements.some(
          (s) => ts.isExportDeclaration(s) && s.moduleSpecifier?.text === specifier,
        )
      )
        add(file, 'repository-export', specifier);
    };
    const tableOf = (node, seen = new Set()) => {
      if (!node || seen.has(node)) return null;
      seen.add(node);
      if (
        ts.isAsExpression(node) ||
        ts.isParenthesizedExpression(node) ||
        ts.isNonNullExpression(node)
      )
        return tableOf(node.expression, seen);
      if (ts.isPropertyAccessExpression(node))
        return owners[node.name.text] ? node.name.text : null;
      if (!ts.isIdentifier(node)) return null;
      const symbol = checker.getSymbolAtLocation(node);
      for (const declaration of symbol?.declarations || []) {
        if (ts.isImportSpecifier(declaration)) {
          const name = declaration.propertyName?.text || declaration.name.text;
          if (owners[name]) return name;
        }
        if (ts.isVariableDeclaration(declaration)) return tableOf(declaration.initializer, seen);
      }
      return null;
    };
    const visit = (n) => {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        ts.isStringLiteralLike(n.moduleSpecifier)
      )
        dependency(
          n.moduleSpecifier.text,
          n.isTypeOnly ||
            n.importClause?.isTypeOnly ||
            (ts.isImportDeclaration(n) &&
              n.importClause?.namedBindings &&
              ts.isNamedImports(n.importClause.namedBindings) &&
              n.importClause.namedBindings.elements.every((e) => e.isTypeOnly)),
        );
      if (
        ts.isCallExpression(n) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
      ) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) dependency(arg.text);
        else if (source) add(file, 'dynamic-dependency', n.getText(ast));
      }
      if (
        protectedEnvironment &&
        ((ts.isPropertyAccessExpression(n) && n.getText(ast) === 'process.env') ||
          (ts.isElementAccessExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === 'process' &&
            ts.isStringLiteralLike(n.argumentExpression) &&
            n.argumentExpression.text === 'env'))
      )
        add(file, 'module-environment', 'process.env');
      if (
        source &&
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'loadEnv'
      )
        add(file, 'module-environment', 'loadEnv');
      if (
        source &&
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ['insert', 'update', 'delete'].includes(n.expression.name.text) &&
        n.arguments.length
      ) {
        const arg = n.arguments[0];
        const name = tableOf(arg);
        if (!name && /(?:^|\.)(?:db|tx)$/.test(n.expression.expression.getText(ast)))
          add(file, 'unresolved-table-write', n.getText(ast));
        if (name && owners[name] && owners[name] !== source)
          add(file, 'foreign-table-write', `${n.expression.name.text}:${name}:${owners[name]}`);
      }
      if (
        source &&
        ts.isCallExpression(n) &&
        ((ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'execute') ||
          (ts.isElementAccessExpression(n.expression) &&
            n.expression.argumentExpression?.text === 'execute'))
      )
        add(
          file,
          'raw-database-execution',
          'Use an owned repository query or a fixed infrastructure operation',
        );
      ts.forEachChild(n, visit);
    };
    visit(ast);
  }
  const reachable = (start, target, seen = new Set()) => {
    if (start === target) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    return [...(edges.get(start) || [])].some((next) => reachable(next, target, seen));
  };
  for (const [source, targets] of edges)
    for (const target of targets)
      if (reachable(target, source))
        violations.push({
          file: `src/modules/${source}/public.ts`,
          rule: 'module-cycle',
          detail: `${source}->${target}`,
        });
  return [...new Map(violations.map((v) => [JSON.stringify(v), v])).values()].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}
export function checkBoundaries(root = process.cwd(), debt = []) {
  const violations = collectViolations(root);
  const keys = new Set(
    debt.map(({ file, rule, detail }) => JSON.stringify({ file, rule, detail })),
  );
  return violations.filter((v) => !keys.has(JSON.stringify(v)));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const debt = JSON.parse(readFileSync(resolve('architecture/boundary-debt.json'), 'utf8'));
  if (debt.some((v) => !v.reason || !v.owner || !v.targetPhase))
    throw Error('Architecture debt requires reason, owner and target phase');
  const unexpected = checkBoundaries(process.cwd(), debt);
  if (unexpected.length) {
    console.error(JSON.stringify(unexpected, null, 2));
    process.exitCode = 1;
  } else console.info(`[architecture] boundaries passed (${debt.length} precise existing debts)`);
}
