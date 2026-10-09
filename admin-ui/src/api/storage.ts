import { apiClient } from './client';
import type { AssetDetail, StorageSettings } from '@lingcoo/contracts';
export const getStorageSettings = () =>
  apiClient('GET /v1/admin/system-settings/storage', '/v1/admin/system-settings/storage');
export const saveStorageSettings = (body: StorageSettings) =>
  apiClient('PUT /v1/admin/system-settings/storage', '/v1/admin/system-settings/storage', {
    body: JSON.stringify(body),
  });
export const testStorageSettings = (body: StorageSettings) =>
  apiClient(
    'POST /v1/admin/system-settings/storage/test',
    '/v1/admin/system-settings/storage/test',
    { body: JSON.stringify(body) },
  );
export const listFolders = () =>
  apiClient('GET /v1/admin/storage/folders', '/v1/admin/storage/folders');
export const createFolder = (name: string) =>
  apiClient('POST /v1/admin/storage/folders', '/v1/admin/storage/folders', {
    body: JSON.stringify({ name }),
  });
export const renameFolder = (id: string, name: string) =>
  apiClient('PATCH /v1/admin/storage/folders/:param', `/v1/admin/storage/folders/${id}`, {
    body: JSON.stringify({ name }),
  });
export const deleteFolder = (id: string) =>
  apiClient('DELETE /v1/admin/storage/folders/:param', `/v1/admin/storage/folders/${id}`);
export const listAssets = (input: {
  page: number;
  search?: string;
  folderId?: string;
  mediaKind?: string;
}) => {
  const query = new URLSearchParams({ page: String(input.page), pageSize: '20' });
  for (const key of ['search', 'folderId', 'mediaKind'] as const)
    if (input[key]) query.set(key, input[key]);
  return apiClient('GET /v1/admin/storage/assets', `/v1/admin/storage/assets?${query}`);
};
export const getAsset = (id: string) =>
  apiClient('GET /v1/admin/storage/assets/:param', `/v1/admin/storage/assets/${id}`);
export const updateAsset = (
  asset: AssetDetail,
  values: {
    displayName: string;
    altText: string | null;
    visibility: 'public' | 'private';
    folderId: string | null;
  },
) =>
  apiClient('PATCH /v1/admin/storage/assets/:param', `/v1/admin/storage/assets/${asset.id}`, {
    body: JSON.stringify({ ...values, expectedRevision: asset.revision }),
  });
export const deleteAsset = (asset: { id: string; revision: number }) =>
  apiClient('DELETE /v1/admin/storage/assets/:param', `/v1/admin/storage/assets/${asset.id}`, {
    body: JSON.stringify({ expectedRevision: asset.revision }),
  });
export async function uploadAsset(
  file: File,
  folderId: string | null,
  visibility: 'public' | 'private',
  replace?: AssetDetail,
) {
  const body = JSON.stringify({
    filename: file.name,
    contentType:
      file.type || (file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'text/plain'),
    sizeBytes: file.size,
    folderId,
    visibility,
    ...(replace ? { expectedRevision: replace.revision } : {}),
  });
  const grant = replace
    ? await apiClient(
        'POST /v1/admin/storage/assets/:param/replacements',
        `/v1/admin/storage/assets/${replace.id}/replacements`,
        { body },
      )
    : await apiClient('POST /v1/admin/storage/uploads', '/v1/admin/storage/uploads', { body });
  return apiClient(
    'PUT /v1/admin/storage/uploads/:param/content',
    `/v1/admin/storage/uploads/${grant.objectId}/content`,
    { body: file, headers: { 'content-type': 'application/octet-stream' } },
  );
}
