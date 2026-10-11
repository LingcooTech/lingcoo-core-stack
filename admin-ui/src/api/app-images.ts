import { apiClient } from './client';
export const listApplicationImageTags = (
  code: string,
  key: string,
  connectionId?: string,
  last?: string,
) => {
  const query = new URLSearchParams({
    ...(connectionId ? { connectionId } : {}),
    ...(last ? { last } : {}),
  });
  return apiClient(
    'GET /v1/admin/apps/:param/images/:param/tags',
    `/v1/admin/apps/${encodeURIComponent(code)}/images/${encodeURIComponent(key)}/tags?${query}`,
  );
};
export const resolveApplicationImage = (
  code: string,
  key: string,
  reference: string,
  connectionId?: string,
) =>
  apiClient(
    'POST /v1/admin/apps/:param/images/:param/resolve',
    `/v1/admin/apps/${encodeURIComponent(code)}/images/${encodeURIComponent(key)}/resolve`,
    { body: JSON.stringify({ reference, ...(connectionId ? { connectionId } : {}) }) },
  );
