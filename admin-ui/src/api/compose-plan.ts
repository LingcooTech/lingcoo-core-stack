import { apiClient } from './client';

export const previewComposePlan = (
  code: string,
  releaseId: string,
  instanceId: string,
  mode: 'managed' | 'self_hosted',
) =>
  apiClient(
    'POST /v1/admin/apps/:param/releases/:param/plan',
    `/v1/admin/apps/${encodeURIComponent(code)}/releases/${encodeURIComponent(releaseId)}/plan`,
    { body: JSON.stringify({ instanceId, mode }) },
  );
