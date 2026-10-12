import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { compileComposePlan, materializeComposePlan } from '../src/modules/app/compose-plan';
import { definitionDigest, validateApplicationDefinition } from '../src/modules/app/definition';
import { composeRuntimeFixture } from './fixtures/compose-runtime';

test('explicit service limits survive compilation and reject missing or conflicting budgets', () => {
  const image = 'docker.io/library/busybox@sha256:' + 'a'.repeat(64);
  const { definition } = composeRuntimeFixture(image);
  if (definition.delivery.kind !== 'compose') throw Error('fixture');
  const resources = definition.delivery.resources;
  resources.serviceLimits = {
    storage: { cpuMillis: 150, memoryMb: 96 },
    web: { cpuMillis: 350, memoryMb: 160 },
  };
  const plan = compileComposePlan(
    {
      id: randomUUID(),
      version: '1',
      commit: 'b'.repeat(40),
      status: 'draft',
      definition,
      definitionDigest: definitionDigest(definition),
      images: { app: image },
      notes: '',
      buildUrl: null,
      createdAt: new Date().toISOString(),
      publishedAt: null,
    },
    { instanceId: randomUUID(), mode: 'managed' },
  );
  assert.deepEqual(
    plan.services.map((s) => [s.name, s.cpuMillis, s.memoryMb]),
    [
      ['storage', 150, 96],
      ['web', 350, 160],
    ],
  );
  const rendered = materializeComposePlan(plan, { PASSWORD: 'a'.repeat(32) }, 25001);
  const services = rendered.compose.services as Record<string, Record<string, unknown>>;
  assert.equal(services.web!.mem_limit, 160 * 1024 * 1024);
  assert.equal(services.storage!.cpus, 0.15);
  resources.serviceLimits.web!.memoryMb++;
  assert.throws(() => validateApplicationDefinition(definition), /aggregate/);
  resources.serviceLimits.web!.memoryMb--;
  resources.serviceWeights = { storage: 1, web: 1 };
  assert.throws(() => validateApplicationDefinition(definition), /not both/);
  delete resources.serviceWeights;
  delete resources.serviceLimits.storage;
  assert.throws(() => validateApplicationDefinition(definition), /every service/);
});
