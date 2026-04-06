import { apiClient } from './client';
import type { QiniuImageListResult, QiniuUploadTokenResult } from './types';

export interface ListQiniuImagesInput {
  prefix?: string;
  marker?: string;
  limit?: number;
}

export interface CreateQiniuUploadTokenInput {
  filename: string;
  prefix?: string;
}

export async function listQiniuImages(input: ListQiniuImagesInput = {}): Promise<QiniuImageListResult> {
  const params = new URLSearchParams();

  if (input.prefix) {
    params.set('prefix', input.prefix);
  }

  if (input.marker) {
    params.set('marker', input.marker);
  }

  if (typeof input.limit === 'number') {
    params.set('limit', String(input.limit));
  }

  const query = params.toString();

  return apiClient<QiniuImageListResult>(`/v1/admin/media/qiniu/images${query ? `?${query}` : ''}`);
}

export async function createQiniuUploadToken(
  payload: CreateQiniuUploadTokenInput
): Promise<QiniuUploadTokenResult> {
  return apiClient<QiniuUploadTokenResult>('/v1/admin/media/qiniu/upload-token', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
