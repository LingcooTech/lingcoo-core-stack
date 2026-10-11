import { apiClient } from './client';
import type { ApplicationPreview } from './app-lifecycle';
export const applyApplicationSource = (code: string, input: ApplicationPreview) =>
  apiClient(
    'PUT /v1/admin/apps/:param/source',
    `/v1/admin/apps/${encodeURIComponent(code)}/source`,
    { body: JSON.stringify(input) },
  );
export const listApplicationBuilds = (code: string) =>
  apiClient(
    'GET /v1/admin/apps/:param/builds',
    `/v1/admin/apps/${encodeURIComponent(code)}/builds`,
  );
export const triggerApplicationBuild = (
  code: string,
  input: { requestId: string; version: string },
) =>
  apiClient(
    'POST /v1/admin/apps/:param/builds',
    `/v1/admin/apps/${encodeURIComponent(code)}/builds`,
    { body: JSON.stringify(input) },
  );
export const listPublishingTokens = (code: string) =>
  apiClient(
    'GET /v1/admin/apps/:param/publishing-tokens',
    `/v1/admin/apps/${encodeURIComponent(code)}/publishing-tokens`,
  );
export const issuePublishingToken = (code: string, name: string) =>
  apiClient(
    'POST /v1/admin/apps/:param/publishing-tokens',
    `/v1/admin/apps/${encodeURIComponent(code)}/publishing-tokens`,
    { body: JSON.stringify({ name }) },
  );
export const revokePublishingToken = (code: string, id: string) =>
  apiClient(
    'DELETE /v1/admin/apps/:param/publishing-tokens/:param',
    `/v1/admin/apps/${encodeURIComponent(code)}/publishing-tokens/${encodeURIComponent(id)}`,
  );
