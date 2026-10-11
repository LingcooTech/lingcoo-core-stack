import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalSettings,
  canonicalDeployment,
} from '../scripts/migrations/canonical-delivery.mjs';
test('retired delivery fields convert without application-name branching', () => {
  const next = canonicalSettings({
    frontendImage: 'registry/app:1',
    acrPassword: 'fixture-secret',
    repoUrl: 'https://example.test/repo',
  });
  assert.equal(next.values.FRONTEND_IMAGE, 'registry/app:1');
  assert.equal(next.secrets.ACR_PASSWORD, 'fixture-secret');
  assert.deepEqual(canonicalSettings(next), next);
});
test('runtime migration preserves generic state and retires app-specific commands', () => {
  const previous = {
    runtimeUpdate: {
      policy: 'manual',
      currentFrontendImage: 'old',
      availableFrontendImage: 'next',
    },
    wordpressAssetsUpdate: {
      current: { THEME_TAG: 'v1' },
      available: { AVAILABLE_THEME_TAG: 'v2' },
    },
    runtimeAssetsUpdate: { current: { web: 'actual' }, offeredAt: 'existing' },
    pendingAction: { kind: 'apply_wordpress_assets' },
    lastAction: { kind: 'apply_runtime_images', id: 'keep' },
    label: 'keep',
  };
  const next = canonicalDeployment(previous, {
    assets: [
      { key: 'web', imageEnv: 'FRONTEND_IMAGE' },
      { key: 'theme', tagEnv: 'THEME_TAG' },
    ],
  });
  assert.deepEqual(next.runtimeAssetsUpdate.current, { web: 'actual', theme: 'v1' });
  assert.deepEqual(next.runtimeAssetsUpdate.available, { web: 'next', theme: 'v2' });
  assert.equal(next.wordpressAssetsUpdate, undefined);
  assert.equal(next.pendingAction, undefined);
  assert.equal(next.lastAction.id, 'keep');
  assert.equal(next.label, 'keep');
  assert.deepEqual(canonicalDeployment(next), next);
  assert.ok(previous.wordpressAssetsUpdate);
});
