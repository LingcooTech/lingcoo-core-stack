import Fastify from 'fastify';
import { registerRequestContracts } from '../src/http/idempotency';
import { requireResult } from '../src/db/required-result';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { responseSchemaFor, isNonJsonResponseRoute } from '@lingcoo/contracts';
import { createApiClient, ProtocolError } from '@lingcoo/api-client';

test('every literal v1 route has a structural response contract or an explicit provider text protocol', () => {
  let count = 0;
  for (const name of readdirSync('src/modules')) {
    let source: string;
    try {
      source = readFileSync(`src/modules/${name}/routes.ts`, 'utf8');
    } catch {
      continue;
    }
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
  for (const name of readdirSync('src/modules')) {
    let source: string;
    try {
      source = readFileSync(`src/modules/${name}/routes.ts`, 'utf8');
    } catch {
      continue;
    }
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
        let path: string | undefined;
        if (target && (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target)))
          path = target.text;
        else if (target && ts.isTemplateExpression(target)) {
          path = target.head.text;
          for (const span of target.templateSpans) {
            if (
              /qs|query|params/.test(span.expression.getText(ast)) &&
              !span.expression.getText(ast).includes('encodeURIComponent')
            )
              break;
            path += ':param' + span.literal.text;
          }
        }
        assert.ok(path, `${name}: static API path required`);
        path = path.split('?')[0] ?? '';
        let method = 'GET';
        const options = node.arguments[1];
        if (options && ts.isObjectLiteralExpression(options)) {
          for (const prop of options.properties)
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name.getText(ast) === 'method' &&
              ts.isStringLiteral(prop.initializer)
            )
              method = prop.initializer.text;
        }
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
