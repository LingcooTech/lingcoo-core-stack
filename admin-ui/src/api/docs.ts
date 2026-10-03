import type {
  DocsSearchIndexResponse,
  DocFeedbackInput,
  DocFeedbackResult,
} from '@lingcoo/contracts/models';
export type {
  DocsSearchIndexItem,
  DocsSearchIndexResponse,
  DocFeedbackInput,
  DocFeedbackResult,
} from '@lingcoo/contracts/models';
import { apiClient } from './client';
import type {
  PublicDocPageDetail,
  PublicDocSpaceDetail,
  PublicDocSpaceListResponse,
} from './types';

export async function listPublicDocSpaces(): Promise<PublicDocSpaceListResponse> {
  return apiClient('GET /v1/docs/spaces', '/v1/docs/spaces');
}

export async function getPublicDocSpace(spaceSlug: string): Promise<PublicDocSpaceDetail> {
  return apiClient(
    'GET /v1/docs/spaces/:param',
    `/v1/docs/spaces/${encodeURIComponent(spaceSlug)}`,
  );
}

export async function getPublicDocPage(
  spaceSlug: string,
  path?: string,
): Promise<PublicDocPageDetail> {
  const qs = new URLSearchParams();
  if (path) {
    qs.set('path', path);
  }
  return apiClient(
    'GET /v1/docs/spaces/:param/page',
    `/v1/docs/spaces/${encodeURIComponent(spaceSlug)}/page${qs.toString() ? `?${qs.toString()}` : ''}`,
  );
}

export async function getDocsSearchIndex(): Promise<DocsSearchIndexResponse> {
  return apiClient('GET /v1/docs/search-index', '/v1/docs/search-index');
}

export async function submitDocFeedback(payload: DocFeedbackInput): Promise<DocFeedbackResult> {
  return apiClient('POST /v1/docs/feedback', '/v1/docs/feedback', {
    body: JSON.stringify(payload),
  });
}
