import { createHmac, randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { systemSettings } from '../db/schema';
import type { DbExecutor } from '../db/types';
import type { AppEnv } from './env';
import { httpError } from './errors';
import { decryptJson, encryptJson, getEncryptionKeys } from './settings-crypto';

export type QiniuSettingsSource = 'database' | 'env' | 'none';

export type QiniuSettings = {
  accessKey: string;
  secretKey?: string;
  bucketName: string;
  publicBaseUrl: string;
  uploadHost: string;
  defaultPrefix: string;
};

export type QiniuSettingsOverview = {
  configured: boolean;
  source: QiniuSettingsSource;
  values: {
    accessKey: string;
    bucketName: string;
    publicBaseUrl: string;
    uploadHost: string;
    defaultPrefix: string;
  };
  secrets: {
    secretKey: {
      configured: boolean;
    };
  };
};

export type QiniuImageItem = {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string | null;
};

const QINIU_SETTING_KEY = 'system.storage.qiniu';
const DEFAULT_UPLOAD_HOST = 'https://upload.qiniup.com';
const DEFAULT_LIST_API_BASE = 'https://rsf.qiniuapi.com';
const IMAGE_KEY_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeUrl(value: unknown, fallback = '') {
  const raw = normalizeString(value);
  if (!raw) {
    return fallback;
  }

  try {
    const url = new URL(raw);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function normalizePrefix(value: unknown) {
  return normalizeString(value).replace(/^\/+|\/+$/g, '');
}

function normalizeLimit(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
}

function urlsafeBase64Encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function signWithSecret(data: string, secretKey: string) {
  return urlsafeBase64Encode(createHmac('sha1', secretKey).update(data).digest());
}

function encodeObjectKey(key: string) {
  return key
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${encodeObjectKey(key)}`;
}

function normalizeUploadedAt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(Math.floor(value / 10_000)).toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return new Date(Math.floor(parsed / 10_000)).toISOString();
    }
  }

  return null;
}

function isImageObject(key: string, mimeType: string) {
  return mimeType.startsWith('image/') || IMAGE_KEY_PATTERN.test(key);
}

function sanitizeFilename(filename: string) {
  const rawName = normalizeString(filename).split(/[/\\]/).pop() ?? 'image';
  const extensionIndex = rawName.lastIndexOf('.');
  const rawBaseName = extensionIndex > 0 ? rawName.slice(0, extensionIndex) : rawName;
  const rawExtension = extensionIndex > 0 ? rawName.slice(extensionIndex).toLowerCase() : '';

  const baseName =
    rawBaseName
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'image';

  const extension = rawExtension.replace(/[^a-z0-9.]/g, '').slice(0, 16);

  return {
    baseName,
    extension,
  };
}

export class QiniuSettingsService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  private getEncryptionSecret() {
    return getEncryptionKeys(this.env);
  }

  private async findSettingRow() {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, QINIU_SETTING_KEY))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting<T>(
    row: NonNullable<Awaited<ReturnType<QiniuSettingsService['findSettingRow']>>>,
  ) {
    if (row.isEncrypted) {
      return decryptJson<T>(row.value, this.getEncryptionSecret());
    }

    return row.value as T;
  }

  private normalizeSettings(value: unknown): QiniuSettings | null {
    const raw = normalizeObject(value);
    const accessKey = normalizeString(raw.accessKey);
    const secretKey = normalizeString(raw.secretKey);
    const bucketName = normalizeString(raw.bucketName);
    const publicBaseUrl = normalizeUrl(raw.publicBaseUrl);
    const uploadHost = normalizeUrl(raw.uploadHost, DEFAULT_UPLOAD_HOST) || DEFAULT_UPLOAD_HOST;
    const defaultPrefix = normalizePrefix(raw.defaultPrefix);

    if (!accessKey && !secretKey && !bucketName && !publicBaseUrl && !defaultPrefix) {
      return null;
    }

    return {
      accessKey,
      secretKey,
      bucketName,
      publicBaseUrl,
      uploadHost,
      defaultPrefix,
    };
  }

  async getDatabaseSettings() {
    const row = await this.findSettingRow();
    return row ? this.normalizeSettings(this.decodeSetting<unknown>(row)) : null;
  }

  getEnvSettings(): QiniuSettings | null {
    const accessKey = normalizeString(this.env.QINIU_ACCESS_KEY);
    const secretKey = normalizeString(this.env.QINIU_SECRET_KEY);
    const bucketName = normalizeString(this.env.QINIU_BUCKET_NAME);
    const publicBaseUrl = normalizeUrl(this.env.QINIU_PUBLIC_BASE_URL);
    const uploadHost =
      normalizeUrl(this.env.QINIU_UPLOAD_HOST, DEFAULT_UPLOAD_HOST) || DEFAULT_UPLOAD_HOST;
    const defaultPrefix = normalizePrefix(this.env.QINIU_DEFAULT_PREFIX);

    if (!accessKey && !secretKey && !bucketName && !publicBaseUrl && !defaultPrefix) {
      return null;
    }

    return {
      accessKey,
      secretKey,
      bucketName,
      publicBaseUrl,
      uploadHost,
      defaultPrefix,
    };
  }

  async getRuntimeSettings(): Promise<QiniuSettings | null> {
    return (await this.getDatabaseSettings()) ?? this.getEnvSettings();
  }

  async resolveDraftSettings(
    input: {
      accessKey?: string;
      secretKey?: string;
      bucketName?: string;
      publicBaseUrl?: string;
      uploadHost?: string;
      defaultPrefix?: string;
    } = {},
  ): Promise<QiniuSettings> {
    const existing = (await this.getDatabaseSettings()) ?? this.getEnvSettings();

    return {
      accessKey: normalizeString(input.accessKey) || existing?.accessKey || '',
      secretKey: normalizeString(input.secretKey) || existing?.secretKey || '',
      bucketName: normalizeString(input.bucketName) || existing?.bucketName || '',
      publicBaseUrl: normalizeUrl(input.publicBaseUrl, existing?.publicBaseUrl ?? ''),
      uploadHost:
        normalizeUrl(input.uploadHost, existing?.uploadHost ?? DEFAULT_UPLOAD_HOST) ||
        DEFAULT_UPLOAD_HOST,
      defaultPrefix: normalizePrefix(input.defaultPrefix) || existing?.defaultPrefix || '',
    };
  }

  private async resolveRequiredSettings(
    input?: {
      accessKey?: string;
      secretKey?: string;
      bucketName?: string;
      publicBaseUrl?: string;
      uploadHost?: string;
      defaultPrefix?: string;
    },
    options: { requirePublicBaseUrl?: boolean } = {},
  ) {
    const settings = input
      ? await this.resolveDraftSettings(input)
      : await this.getRuntimeSettings();

    if (!settings?.accessKey || !settings.secretKey || !settings.bucketName) {
      throw httpError(422, '七牛云配置不完整，请先填写 Access Key、Secret Key 和 Bucket');
    }

    if (options.requirePublicBaseUrl && !settings.publicBaseUrl) {
      throw httpError(422, '请先配置七牛云公共访问域名，用于图片预览和回填链接');
    }

    return settings;
  }

  async getOverview(): Promise<QiniuSettingsOverview> {
    const databaseSettings = await this.getDatabaseSettings();
    const envSettings = this.getEnvSettings();
    const effective = databaseSettings ?? envSettings;
    const source: QiniuSettingsSource = databaseSettings
      ? 'database'
      : envSettings
        ? 'env'
        : 'none';

    return {
      configured: Boolean(
        effective?.accessKey &&
        effective.secretKey &&
        effective.bucketName &&
        effective.publicBaseUrl,
      ),
      source,
      values: {
        accessKey: effective?.accessKey ?? '',
        bucketName: effective?.bucketName ?? '',
        publicBaseUrl: effective?.publicBaseUrl ?? '',
        uploadHost: effective?.uploadHost ?? DEFAULT_UPLOAD_HOST,
        defaultPrefix: effective?.defaultPrefix ?? '',
      },
      secrets: {
        secretKey: {
          configured: hasSecret(effective?.secretKey),
        },
      },
    };
  }

  async upsertSettings(
    input: {
      accessKey?: string;
      secretKey?: string;
      bucketName?: string;
      publicBaseUrl?: string;
      uploadHost?: string;
      defaultPrefix?: string;
    },
    updatedByUserId: string,
  ) {
    const next = await this.resolveDraftSettings(input);
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: QINIU_SETTING_KEY,
        value: encryptJson(next, this.getEncryptionSecret()),
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(next, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now,
        },
      });

    return this.getOverview();
  }

  async clearSettings() {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, QINIU_SETTING_KEY));
  }

  private createManagementToken(url: string, accessKey: string, secretKey: string) {
    const parsed = new URL(url);
    const data = `${parsed.pathname}${parsed.search}\n`;
    return `${accessKey}:${signWithSecret(data, secretKey)}`;
  }

  private async listBucketObjects(
    settings: QiniuSettings,
    input: {
      prefix?: string;
      marker?: string;
      limit?: number;
      imagesOnly?: boolean;
    } = {},
  ) {
    const url = new URL('/list', DEFAULT_LIST_API_BASE);
    url.searchParams.set('bucket', settings.bucketName);
    url.searchParams.set('limit', String(normalizeLimit(input.limit, 60)));

    const prefix = normalizePrefix(input.prefix);
    const marker = normalizeString(input.marker);

    if (prefix) {
      url.searchParams.set('prefix', prefix);
    }

    if (marker) {
      url.searchParams.set('marker', marker);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `QBox ${this.createManagementToken(url.toString(), settings.accessKey, settings.secretKey ?? '')}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw httpError(
        502,
        detail ? `七牛云请求失败: ${detail}` : `七牛云请求失败 (${response.status})`,
      );
    }

    const payload = (await response.json()) as {
      items?: Array<{
        key?: string;
        putTime?: number | string;
        fsize?: number;
        mimeType?: string;
      }>;
      marker?: string;
    };

    const items = (payload.items ?? [])
      .map((item): QiniuImageItem | null => {
        const key = normalizeString(item.key);
        const mimeType = normalizeString(item.mimeType);

        if (!key) {
          return null;
        }

        if (input.imagesOnly && !isImageObject(key, mimeType)) {
          return null;
        }

        return {
          key,
          url: settings.publicBaseUrl ? buildPublicUrl(settings.publicBaseUrl, key) : '',
          size: typeof item.fsize === 'number' && Number.isFinite(item.fsize) ? item.fsize : 0,
          mimeType,
          uploadedAt: normalizeUploadedAt(item.putTime),
        };
      })
      .filter((item): item is QiniuImageItem => Boolean(item));

    return {
      items,
      marker: normalizeString(payload.marker) || null,
      prefix,
      limit: normalizeLimit(input.limit, 60),
    };
  }

  async testConnection(input: {
    accessKey?: string;
    secretKey?: string;
    bucketName?: string;
    publicBaseUrl?: string;
    uploadHost?: string;
    defaultPrefix?: string;
  }) {
    const settings = await this.resolveRequiredSettings(input);
    const result = await this.listBucketObjects(settings, { limit: 1, imagesOnly: false });

    return {
      ok: true,
      bucketName: settings.bucketName,
      publicBaseUrl: settings.publicBaseUrl,
      sampleCount: result.items.length,
    };
  }

  async listImages(input: { prefix?: string; marker?: string; limit?: number }) {
    const settings = await this.resolveRequiredSettings(undefined, { requirePublicBaseUrl: true });
    const result = await this.listBucketObjects(settings, {
      prefix: input.prefix,
      marker: input.marker,
      limit: input.limit,
      imagesOnly: true,
    });

    return {
      items: result.items,
      marker: result.marker,
      hasMore: Boolean(result.marker),
      prefix: result.prefix,
      limit: result.limit,
    };
  }

  async createUploadToken(input: { filename: string; prefix?: string }) {
    const settings = await this.resolveRequiredSettings(undefined, { requirePublicBaseUrl: true });
    const filename = normalizeString(input.filename);

    if (!filename) {
      throw httpError(422, '请选择要上传的文件');
    }

    const { baseName, extension } = sanitizeFilename(filename);
    const date = new Date();
    const datePrefix = [
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('/');
    const prefix = [settings.defaultPrefix, normalizePrefix(input.prefix)]
      .filter(Boolean)
      .join('/');
    const objectKey = [
      prefix,
      datePrefix,
      `${baseName}-${Date.now()}-${randomBytes(4).toString('hex')}${extension}`,
    ]
      .filter(Boolean)
      .join('/');
    const expiresIn = 3600;
    const deadline = Math.floor(Date.now() / 1000) + expiresIn;
    const policy = {
      scope: `${settings.bucketName}:${objectKey}`,
      deadline,
    };
    const encodedPolicy = urlsafeBase64Encode(JSON.stringify(policy));
    const uploadToken = `${settings.accessKey}:${signWithSecret(encodedPolicy, settings.secretKey ?? '')}:${encodedPolicy}`;

    return {
      uploadToken,
      key: objectKey,
      uploadHost: settings.uploadHost,
      publicUrl: buildPublicUrl(settings.publicBaseUrl, objectKey),
      expiresIn,
    };
  }
}
