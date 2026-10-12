import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { applicationReleaseSchema } from '@lingcoo/contracts';
import { compileComposePlan, materializeComposePlan } from '../src/modules/app/compose-plan';
import { definitionDigest, validateApplicationDefinition } from '../src/modules/app/definition';

function release() {
  const definition = validateApplicationDefinition(
    JSON.parse(readFileSync('examples/stack-compose-app.json', 'utf8')),
  );
  return applicationReleaseSchema.parse({
    id: randomUUID(),
    version: '1.0.0',
    commit: 'a'.repeat(40),
    status: 'draft',
    definition,
    definitionDigest: definitionDigest(definition),
    images: { web: 'registry.example.com/lingcoo/example-web@sha256:' + 'b'.repeat(64) },
    notes: '',
    buildUrl: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  });
}
test('version-bound plans pin every image, isolate projects and preserve aggregate budgets', () => {
  const source = release();
  if (source.definition.delivery.kind !== 'compose') throw Error('fixture');
  source.definition.delivery.compose = {
    services: {
      web: { image: '${WEB_IMAGE}', mem_limit: '99g', cpus: 32 },
      worker: { image: '${WEB_IMAGE}' },
      database: { image: 'registry.example.com/postgres@sha256:' + 'c'.repeat(64) },
    },
  };
  delete source.definition.delivery.resources.serviceLimits;
  source.definition.delivery.resources.serviceWeights = { web: 2, worker: 1, database: 3 };
  source.definitionDigest = definitionDigest(source.definition);
  const instanceId = randomUUID(),
    plan = compileComposePlan(source, {
      instanceId,
      mode: 'managed',
    });
  assert.equal(
    plan.services.reduce((n, v) => n + v.memoryMb, 0),
    256,
  );
  assert.equal(
    plan.services.reduce((n, v) => n + v.cpuMillis, 0),
    500,
  );
  assert.ok(plan.services.every((v) => v.image.includes('@sha256:')));
  assert.ok(plan.services.every((v) => v.memoryMb >= 64));
  assert.equal(plan.releaseId, source.id);
  assert.notEqual(
    plan.project,
    compileComposePlan(source, { instanceId: randomUUID(), mode: 'managed' }).project,
  );
  assert.equal(
    plan.releaseDigest,
    compileComposePlan(source, { instanceId: randomUUID(), mode: 'self_hosted' }).releaseDigest,
  );
  assert.equal(
    (source.definition.delivery.compose.services as Record<string, { cpus?: number }>).web?.cpus,
    32,
  );
  const tampered = structuredClone(source);
  tampered.images.web = 'registry.example.com/another/image@sha256:' + 'b'.repeat(64);
  assert.throws(() => compileComposePlan(tampered, { instanceId, mode: 'managed' }), /repository/);
  const inheritedImage = structuredClone(source);
  inheritedImage.definition.images[0]!.key = 'constructor';
  inheritedImage.definitionDigest = definitionDigest(inheritedImage.definition);
  assert.throws(() => compileComposePlan(inheritedImage, { instanceId, mode: 'managed' }), {
    statusCode: 422,
  });
  assert.throws(
    () =>
      compileComposePlan({ ...source, definitionDigest: 'wrong' }, { instanceId, mode: 'managed' }),
    /digest/,
  );
  source.definition.delivery.resources.serviceWeights = { web: 1 };
  assert.throws(() => compileComposePlan(source, { instanceId, mode: 'managed' }), /weights/);
  source.definition.delivery.resources.serviceWeights = { web: 2, worker: 1, database: 3 };
  source.definition.delivery.resources.memoryMb = 128;
  source.definitionDigest = definitionDigest(source.definition);
  assert.throws(() => compileComposePlan(source, { instanceId, mode: 'managed' }), /too small/);
});
test('materialization validates required configuration and preserves literal secrets without re-interpolation', () => {
  const source = release();
  if (source.definition.delivery.kind !== 'compose') throw Error('fixture');
  source.definition.delivery.secretFields = [
    {
      key: 'PASSWORD',
      label: 'Password',
      type: 'secret',
      required: true,
      scope: 'preset',
      editable: false,
      advanced: true,
    },
  ];
  source.definition.delivery.envFields = [
    {
      key: 'ENABLED',
      label: 'Enabled',
      type: 'boolean',
      required: true,
      scope: 'user_input',
      editable: true,
      advanced: false,
      defaultValue: false,
    },
  ];
  source.definition.delivery.compose = {
    services: {
      web: {
        image: '${WEB_IMAGE}',
        environment: {
          PASSWORD: '${PASSWORD}',
          ENABLED: '${ENABLED}',
          DOMAIN: '${APP_DOMAIN}',
          IMAGE: '${WEB_IMAGE}',
        },
        command: ['sh', '-c', 'echo $$RUNTIME'],
      },
    },
  };
  source.definitionDigest = definitionDigest(source.definition);
  const plan = compileComposePlan(source, { instanceId: randomUUID(), mode: 'self_hosted' }),
    values = { PASSWORD: 'literal${OTHER}$value\nsecond line', APP_DOMAIN: 'demo.app.lingcoo.com' };
  assert.ok(!JSON.stringify(plan).includes(values.PASSWORD));
  const runtime = materializeComposePlan(plan, values, 23001),
    web = (runtime.compose.services as Record<string, Record<string, unknown>>).web!;
  assert.deepEqual(web.ports, [
    { target: 80, published: 23001, host_ip: '127.0.0.1', protocol: 'tcp' },
  ]);
  assert.deepEqual(web.environment, {
    PASSWORD: 'literal$${OTHER}$$value\nsecond line',
    ENABLED: 'false',
    DOMAIN: values.APP_DOMAIN,
    IMAGE: source.images.web,
  });
  assert.deepEqual(web.command, ['sh', '-c', 'echo $$RUNTIME']);
  assert.equal(runtime.healthUrl, 'http://127.0.0.1:23001/');
  assert.throws(
    () => materializeComposePlan(plan, { APP_DOMAIN: values.APP_DOMAIN }, 23001),
    /Required/,
  );
  assert.throws(
    () => materializeComposePlan(plan, { ...values, PASSWORD: 'secret\0' }, 23001),
    /limits/,
  );
  assert.throws(
    () => materializeComposePlan(plan, { ...values, ENABLED: 'maybe' }, 23001),
    /boolean/,
  );
  assert.throws(
    () => materializeComposePlan(plan, { ...values, APP_DOMAIN: 'https://example.com' }, 23001),
    /domain/,
  );
  assert.throws(
    () => materializeComposePlan(plan, { ...values, WEB_IMAGE: 'evil' }, 23001),
    /Undeclared/,
  );
  assert.throws(() => materializeComposePlan(plan, values, 80));
});
