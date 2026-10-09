import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostedProbePaths } from '../src/modules/deployment/https-probe';

test('hosted HTTPS checks support application-specific readiness paths', () => {
  assert.deepEqual(hostedProbePaths({}), ['/']);
  const profile = {
    enabled: true,
    domainField: 'domain',
    resources: { cpuMillis: 1000, memoryMb: 1024, diskMb: 10240 },
    httpChecks: ['/', '/admin/', '/health/ready'],
  };
  assert.deepEqual(hostedProbePaths({ hostingProfile: profile }), profile.httpChecks);
  for (const httpChecks of [
    [],
    ['/health/ready', 'https://example.com'],
    ['/health/ready', '/bad\r\nHost: other'],
  ]) {
    assert.throws(() => hostedProbePaths({ hostingProfile: { ...profile, httpChecks } }));
  }
});
