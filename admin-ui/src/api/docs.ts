import { apiClient } from './client';
import type {
  PublicDocPageDetail,
  PublicDocSpaceDetail,
  PublicDocSpaceListResponse,
} from './types';

export interface DocsSearchIndexItem {
  spaceSlug: string;
  spaceTitle: string;
  pagePath: string;
  pageTitle: string;
  summary: string | null;
}

export interface DocsSearchIndexResponse {
  items: DocsSearchIndexItem[];
}

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
