import Fastify from 'fastify';
import { registerRequestContracts } from '../src/http/idempotency';
import { requireResult } from '../src/db/required-result';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { responseContracts, responseSchemaFor, isNonJsonResponseRoute } from '@lingcoo/contracts';
import { createApiClient, ProtocolError } from '@lingcoo/api-client';

const routeFiles = readdirSync('src/modules', { recursive: true }).filter(
  (name): name is string => typeof name === 'string' && /(?:^|\/|-)routes\.ts$/.test(name),
);

test('every literal v1 route has a structural response contract or an explicit provider text protocol', () => {
  const identities = responseContracts.map((route) => `${route.method} ${route.path}`);
  assert.equal(new Set(identities).size, identities.length, 'Endpoint identities must be unique');
  let count = 0;
  for (const name of routeFiles) {
    const source = readFileSync(`src/modules/${name}`, 'utf8');
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text)
      ) {
        const path = requireResult(node.arguments[0], 'fixture array element');
        if (path && ts.isStringLiteral(path) && path.text.startsWith('/v1/')) {
          const method = node.expression.name.text.toUpperCase();
          count++;
          assert.ok(
            responseSchemaFor(method, path.text) || isNonJsonResponseRoute(method, path.text),
            `${method} ${path.text}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.ok(count > 150);
});
test('unknown SDK success and malformed nested business objects fail closed', async () => {
  for (const [path, payload] of [
    ['/unregistered', { ok: true }],
    [
      '/v1/content',
      { items: [{ title: 'Missing required fields' }], total: 1, limit: 20, offset: 0 },
    ],
    ['/v1/notifications/me', { items: [], total: 'wrong', limit: 20, offset: 0 }],
    ['/v1/docs/search-index', { items: [{ spaceSlug: 'docs', pageTitle: 123 }] }],
  ] as const) {
    await assert.rejects(
      createApiClient({ fetch: async () => Response.json(payload) })(path),
      ProtocolError,
    );
  }
  assert.equal(
    responseSchemaFor('GET', '/v1/admin/notifications?limit=10')?.safeParse({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    }).success,
    true,
  );
  assert.equal(responseSchemaFor('GET', '/v1/unregistered'), undefined);
});

test('client routes resolve to registered server methods and response contracts', () => {
  const registered = new Set<string>();
  const normalize = (path: string) => path.replace(/:[^/]+/g, ':param');
  for (const name of routeFiles) {
    const source = readFileSync(`src/modules/${name}`, 'utf8');
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const path = node.arguments[0];
        if (path && ts.isStringLiteral(path))
          registered.add(`${node.expression.name.text.toUpperCase()} ${normalize(path.text)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  registered.add('POST /v1/auth/session/login');
  registered.add('POST /v1/auth/session/register');
  for (const name of readdirSync('admin-ui/src/api').filter((name) => name.endsWith('.ts'))) {
    const ast = ts.createSourceFile(
      name,
      readFileSync(`admin-ui/src/api/${name}`, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'apiClient'
      ) {
        const target = node.arguments[0];
        assert.ok(target && ts.isStringLiteral(target), `${name}: static endpoint ID required`);
        assert.equal(
          node.typeArguments?.length ?? 0,
          0,
          `${name}: caller response assertions are forbidden`,
        );
        const id = target.text;
        const space = id.indexOf(' ');
        const method = id.slice(0, space);
        const path = id.slice(space + 1);
        const actualTarget = node.arguments[1];
        let actualPath: string | undefined;
        if (actualTarget && ts.isStringLiteralLike(actualTarget)) actualPath = actualTarget.text;
        else if (actualTarget && ts.isTemplateExpression(actualTarget)) {
          actualPath = actualTarget.head.text;
          for (const span of actualTarget.templateSpans) {
            if (
              /qs|query|params/.test(span.expression.getText(ast)) &&
              !span.expression.getText(ast).includes('encodeURIComponent')
            )
              break;
            actualPath += ':param' + span.literal.text;
          }
        }
        assert.ok(actualPath, `${name}: reviewable API path required`);
        assert.equal(
          normalize(actualPath.split('?')[0] ?? ''),
          path,
          `${name}: actual path must match endpoint identity`,
        );
        assert.ok(
          registered.has(`${method} ${normalize(path)}`),
          `Unregistered client route: ${method} ${path}`,
        );
        assert.ok(
          responseSchemaFor(method, path),
          `Missing client response contract: ${method} ${path}`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});

test('route registration rejects a new v1 endpoint without a response contract', async () => {
  const app = Fastify();
  registerRequestContracts(app);
  assert.throws(
    () => app.get('/v1/uncontracted-new-business', async () => ({ ok: true })),
    /Missing response contract/,
  );
  await app.close();
});

test('browser document routes have server SPA entries for deep links and refresh', () => {
  const entries = new Set<string>();
  const normalize = (path: string) => path.replace(/:[^/]+/g, ':param');
  const server = ts.createSourceFile(
    'routes.ts',
    readFileSync('src/modules/admin/routes.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function readServer(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'get'
    ) {
      const [path, handler] = node.arguments;
      if (
        path &&
        ts.isStringLiteral(path) &&
        handler &&
        ts.isIdentifier(handler) &&
        handler.text === 'sendSPA'
      )
        entries.add(normalize(path.text));
    }
    ts.forEachChild(node, readServer);
  }
  readServer(server);
  const browser = ts.createSourceFile(
    'App.tsx',
    readFileSync('admin-ui/src/App.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let count = 0;
  function readBrowser(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(browser) === 'path' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text.startsWith('/')
    ) {
      count++;
      assert(
        entries.has(normalize(node.initializer.text)),
        `Missing server HTML entry for ${node.initializer.text}`,
      );
    }
    ts.forEachChild(node, readBrowser);
  }
  readBrowser(browser);
  assert(count > 30, 'All document routes must be checked');
});
