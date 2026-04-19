import { apiClient } from './client';
import type { ContentItem, ContentListResponse } from './types';

function buildQueryString<T extends object>(params: T | undefined) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

export async function listPublishedContent(params: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<ContentListResponse> {
  const qs = buildQueryString(params);
  return apiClient<ContentListResponse>(`/v1/content${qs ? `?${qs}` : ''}`);
}

export async function getPublishedContent(slug: string): Promise<ContentItem> {
  return apiClient<ContentItem>(`/v1/content/${encodeURIComponent(slug)}`);
}
