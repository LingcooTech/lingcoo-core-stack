import { hostingAlerts } from '../src/modules/deployment/hosting-alerts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeploymentSchema, hostedPrefixSchema } from '@lingcoo/contracts';
import { evaluateHostingNode, HOSTING_REPORT_MAX_AGE_MS } from '../src/modules/deployment/hosting';
import type { hostingNodes } from '../src/db/schema';

const now = new Date('2026-10-07T04:00:00Z');
const node: typeof hostingNodes.$inferSelect = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'test',
  asset: {},
  serverIp: '192.0.2.1',
  enabled: true,
  cpuMillis: 4000,
  memoryMb: 8192,
  diskMb: 40960,
  reportTokenHash: 'not-a-real-hash',
  report: { dockerReady: true, available: { cpuMillis: 4000, memoryMb: 8192, diskMb: 40960 } },
  lastReportedAt: now,
  createdAt: now,
};
const request = { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 };
const zero = { cpuMillis: 0, memoryMb: 0, diskMb: 0 };
test('allocator rejects offline, stale, future, disabled and unhealthy nodes', () => {
  assert.notEqual(evaluateHostingNode(node, zero, request, now), null);
  for (const override of [
    { enabled: false },
    { lastReportedAt: null },
    { lastReportedAt: new Date(now.getTime() + 1) },
    { lastReportedAt: new Date(now.getTime() - HOSTING_REPORT_MAX_AGE_MS - 1) },
    { report: { dockerReady: false, available: node.report } },
    { report: null },
  ])
    assert.equal(evaluateHostingNode({ ...node, ...override }, zero, request, now), null);
});
test('capacity accounts for concurrent reservations and measured disk/memory pressure', () => {
  assert.notEqual(evaluateHostingNode(node, request, request, now), null);
  assert.equal(evaluateHostingNode(node, { ...request, memoryMb: 4097 }, request, now), null);
  assert.equal(
    evaluateHostingNode(
      { ...node, report: { dockerReady: true, available: { ...request, diskMb: 20479 } } },
      zero,
      request,
      now,
    ),
    null,
  );
});
test('prefixes are canonical and reject reserved or invalid names', () => {
  assert.equal(hostedPrefixSchema.parse(' My-Shop '), 'my-shop');
  for (const value of [
    'www',
    'admin',
    'ab',
    '-foo',
    'foo-',
    'foo--bar',
    'x.y',
    '你好',
    'a'.repeat(49),
  ]) {
    assert.equal(hostedPrefixSchema.safeParse(value).success, false, value);
  }
});
test('deployment commands expose exactly two modes and enforce their distinct inputs', () => {
  const base = {
    appCode: 'retail',
    entitlementId: '00000000-0000-4000-8000-000000000001',
    label: 'test',
  };
  assert.equal(createDeploymentSchema.safeParse(base).success, false);
  assert.equal(
    createDeploymentSchema.parse({ ...base, serverHost: '192.0.2.1' }).deploymentMode,
    'self_hosted',
  );
  assert.equal(
    createDeploymentSchema.safeParse({ ...base, deploymentMode: 'managed' }).success,
    true,
  );
  for (const extra of [
    { serverHost: '192.0.2.1' },
    { installPath: '/tmp/override' },
    { domainValues: { primaryDomain: 'other.example.com' } },
    { hostingNodeId: node.id },
    { resources: request },
  ]) {
    assert.equal(
      createDeploymentSchema.safeParse({ ...base, deploymentMode: 'managed', ...extra }).success,
      false,
    );
  }
  for (const deploymentMode of ['cloudbase', 'sae', 'cloud_run'])
    assert.equal(createDeploymentSchema.safeParse({ ...base, deploymentMode }).success, false);
});

test('certificate automation failures and stale backups remain visible on paused nodes', () => {
  const report = {
    dockerReady: true,
    canDeploy: false,
    available: { cpuMillis: 1000, memoryMb: 1000, diskMb: 20000 },
    certificateAutomation: { status: 'failed', checkedAt: now.toISOString() },
    containers: [],
    backups: [
      {
        deploymentId: node.id,
        status: 'success',
        completedAt: new Date(now.getTime() - 37 * 3600000).toISOString(),
        offsiteStatus: 'failed',
        offsiteAt: null,
      },
    ],
  };
  const alerts = hostingAlerts({ ...node, enabled: false, report }, now);
  assert.ok(alerts.some((a) => a.code === 'certificate_automation'));
  assert.ok(alerts.some((a) => a.code === 'backup_' + node.id));
  assert.ok(alerts.some((a) => a.code === 'offsite_' + node.id));
  assert.ok(!alerts.some((a) => a.code.startsWith('instance_unavailable_')));
  assert.ok(!alerts.some((a) => a.code === 'node_offline'));
});
