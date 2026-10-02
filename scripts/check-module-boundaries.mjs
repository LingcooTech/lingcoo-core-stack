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
  for (const file of walk(src)) {
    const source = moduleOf(file),
      ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true),
      tables = new Map();
    const dependency = (specifier, typeOnly = false) => {
      const target =
        ts.resolveModuleName(specifier, file, config.options, ts.sys).resolvedModule
          ?.resolvedFileName || resolve(dirname(file), specifier + '.ts');
      const dest = moduleOf(target);
      if (source && dest && source !== dest) {
        if (!target.endsWith('/public.ts')) add(file, 'internal-import', specifier);
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
    for (const st of ast.statements)
      if (
        ts.isImportDeclaration(st) &&
        st.importClause?.namedBindings &&
        ts.isNamedImports(st.importClause.namedBindings)
      )
        for (const binding of st.importClause.namedBindings.elements) {
          const original = binding.propertyName?.text || binding.name.text;
          if (owners[original]) tables.set(binding.name.text, original);
        }
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
      if (source && ts.isPropertyAccessExpression(n) && n.getText(ast) === 'process.env')
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
        const name = ts.isIdentifier(arg)
          ? tables.get(arg.text)
          : ts.isPropertyAccessExpression(arg)
            ? arg.name.text
            : null;
        if (name && owners[name] && owners[name] !== source)
          add(file, 'foreign-table-write', `${n.expression.name.text}:${name}:${owners[name]}`);
      }
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
