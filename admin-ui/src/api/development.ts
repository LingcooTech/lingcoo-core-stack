import { apiClient } from './client';
import type { ApplicationPreview } from './app-lifecycle';
export const listDevelopmentProjects = () =>
  apiClient('GET /v1/admin/development/projects', '/v1/admin/development/projects');
export const createDevelopmentProject = (body: ApplicationPreview) =>
  apiClient('POST /v1/admin/development/projects', '/v1/admin/development/projects', {
    body: JSON.stringify(body),
  });
export const getDevelopmentProject = (code: string) =>
  apiClient(
    'GET /v1/admin/development/projects/:param',
    `/v1/admin/development/projects/${encodeURIComponent(code)}`,
  );
export const createProjectProduct = (code: string) =>
  apiClient(
    'POST /v1/admin/development/projects/:param/product',
    `/v1/admin/development/projects/${encodeURIComponent(code)}/product`,
  );
export const listDevelopmentInventory = (id: string, query: URLSearchParams) =>
  apiClient(
    'GET /v1/admin/development/connections/:param/inventory',
    `/v1/admin/development/connections/${encodeURIComponent(id)}/inventory?${query}`,
  );
export const selectDeliveryVersion = (code: string, releaseId: string) =>
  apiClient(
    'POST /v1/admin/apps/:param/delivery-version',
    `/v1/admin/apps/${encodeURIComponent(code)}/delivery-version`,
    { body: JSON.stringify({ releaseId }) },
  );
