import { apiClient } from './client';
import type { EndpointResponse } from '@lingcoo/contracts';

export type ApplicationPreview = EndpointResponse<'POST /v1/admin/apps/import/preview'>;
export const listAppConnections = () =>
  apiClient('GET /v1/admin/app-connections', '/v1/admin/app-connections');
export const createAppConnection = (input: unknown) =>
  apiClient('POST /v1/admin/app-connections', '/v1/admin/app-connections', {
    body: JSON.stringify(input),
  });
export const deleteAppConnection = (id: string) =>
  apiClient(
    'DELETE /v1/admin/app-connections/:param',
    `/v1/admin/app-connections/${encodeURIComponent(id)}`,
  );
export const previewApplication = (input: unknown) =>
  apiClient('POST /v1/admin/apps/import/preview', '/v1/admin/apps/import/preview', {
    body: JSON.stringify(input),
  });
export const importApplication = (input: ApplicationPreview) =>
  apiClient('POST /v1/admin/apps/import', '/v1/admin/apps/import', { body: JSON.stringify(input) });
export const getApplicationLifecycle = (code: string) =>
  apiClient(
    'GET /v1/admin/apps/:param/lifecycle',
    `/v1/admin/apps/${encodeURIComponent(code)}/lifecycle`,
  );
export const registerApplicationRelease = (code: string, input: unknown) =>
  apiClient(
    'POST /v1/admin/apps/:param/releases',
    `/v1/admin/apps/${encodeURIComponent(code)}/releases`,
    { body: JSON.stringify(input) },
  );
export const publishApplicationRelease = (code: string, id: string) =>
  apiClient(
    'POST /v1/admin/apps/:param/releases/:param/publish',
    `/v1/admin/apps/${encodeURIComponent(code)}/releases/${encodeURIComponent(id)}/publish`,
  );
export const withdrawApplicationRelease = (code: string, id: string) =>
  apiClient(
    'POST /v1/admin/apps/:param/releases/:param/withdraw',
    `/v1/admin/apps/${encodeURIComponent(code)}/releases/${encodeURIComponent(id)}/withdraw`,
  );
