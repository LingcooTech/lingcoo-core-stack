import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import ts from 'typescript';

export function inspectArchitecture(root = process.cwd()) {
  const modulesRoot = resolve(root, 'src/modules');
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = resolve(dir, entry.name);
      return entry.isDirectory() ? walk(file) : file.endsWith('.ts') ? [file] : [];
    });
  const modules = readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const imports = [];
  for (const file of walk(modulesRoot)) {
    const source = relative(modulesRoot, file).split(sep)[0];
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (
        !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const target = relative(modulesRoot, resolve(dirname(file), specifier)).split(sep);
      if (target[0] === '..' || target[0] === source || !modules.includes(target[0])) continue;
      imports.push({
        file: relative(root, file).split(sep).join('/'),
        source,
        target: target[0],
        specifier,
      });
    }
  }
  return {
    modules,
    publicEntries: modules.filter((module) =>
      existsSync(resolve(modulesRoot, module, 'public.ts')),
    ),
    crossModuleImports: imports,
    tableOwners: JSON.parse(readFileSync(resolve(root, 'architecture/table-owners.json'), 'utf8')),
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  console.info(JSON.stringify(inspectArchitecture(), null, 2));
}
