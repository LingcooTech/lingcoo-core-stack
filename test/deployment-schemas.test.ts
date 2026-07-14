import assert from 'node:assert/strict';
import test from 'node:test';

import { reportDeploymentStatusSchema } from '../src/modules/deployment/schemas';

test('accepts generic runtime asset status reports', () => {
  const payload = reportDeploymentStatusSchema.parse({
    deploymentId: '11111111-1111-4111-8111-111111111111',
    token: 'deployment-status-token',
    runtimeAssets: {
      current: {
        'fd-edu-runtime-image': 'registry.example.com/fd-edu-system:current',
      },
      available: {
        'fd-edu-runtime-image': 'registry.example.com/fd-edu-system:next',
      },
      offeredAt: '2026-07-14T00:00:00.000Z',
    },
  });

  assert.equal(
    payload.runtimeAssets?.available?.['fd-edu-runtime-image'],
    'registry.example.com/fd-edu-system:next',
  );
});

test('keeps legacy runtime image status reports compatible', () => {
  const payload = reportDeploymentStatusSchema.parse({
    deploymentId: '22222222-2222-4222-8222-222222222222',
    token: 'legacy-deployment-status-token',
    runtimeImages: {
      currentFrontendImage: 'registry.example.com/frontend:current',
    },
  });

  assert.equal(
    payload.runtimeImages?.currentFrontendImage,
    'registry.example.com/frontend:current',
  );
});
