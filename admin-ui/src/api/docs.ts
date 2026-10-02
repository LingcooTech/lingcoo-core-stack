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
  return apiClient<PublicDocSpaceListResponse>('/v1/docs/spaces');
}

export async function getPublicDocSpace(spaceSlug: string): Promise<PublicDocSpaceDetail> {
  return apiClient<PublicDocSpaceDetail>(`/v1/docs/spaces/${encodeURIComponent(spaceSlug)}`);
}

export async function getPublicDocPage(
  spaceSlug: string,
  path?: string,
): Promise<PublicDocPageDetail> {
  const qs = new URLSearchParams();
  if (path) {
    qs.set('path', path);
  }
  return apiClient<PublicDocPageDetail>(
    `/v1/docs/spaces/${encodeURIComponent(spaceSlug)}/page${qs.toString() ? `?${qs.toString()}` : ''}`,
  );
}

export async function getDocsSearchIndex(): Promise<DocsSearchIndexResponse> {
  return apiClient<DocsSearchIndexResponse>('/v1/docs/search-index');
}

export async function submitDocFeedback(payload: DocFeedbackInput): Promise<DocFeedbackResult> {
  return apiClient<DocFeedbackResult>('/v1/docs/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
