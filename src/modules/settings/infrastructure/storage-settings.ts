import { eq } from 'drizzle-orm';
import { storageSettingsSchema, type StorageSettings } from '@lingcoo/contracts';
import { systemSettings } from '../../../db/schema';
import type { DbExecutor } from '../../../db/types';
import type { AppEnv } from '../../../lib/env';
import { encryptJson, decryptJson, getEncryptionKeys } from '../../../lib/settings-crypto';
import { QiniuSettingsService } from './qiniu-settings';
const key = 'system.storage.s3';
export class StorageSettingsService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}
  async runtime(): Promise<{
    value: StorageSettings;
    source: 'database' | 'env' | 'legacy' | 'none';
  }> {
    const [row] = await this.db.select().from(systemSettings).where(eq(systemSettings.key, key));
    if (row)
      return {
        value: storageSettingsSchema.parse(decryptJson(row.value, getEncryptionKeys(this.env))),
        source: 'database',
      };
    if (this.env.STORAGE_S3_BUCKET || this.env.STORAGE_PROVIDER === 'local')
      return {
        value: storageSettingsSchema.parse({
          provider: this.env.STORAGE_PROVIDER ?? 's3',
          region: this.env.STORAGE_S3_REGION,
          endpoint: this.env.STORAGE_S3_ENDPOINT,
          bucket: this.env.STORAGE_S3_BUCKET,
          accessKey: this.env.STORAGE_S3_ACCESS_KEY,
          secretKey: this.env.STORAGE_S3_SECRET_KEY,
          forcePathStyle: this.env.STORAGE_S3_FORCE_PATH_STYLE,
          defaultPrefix: this.env.STORAGE_DEFAULT_PREFIX,
          publicBaseUrl: this.env.STORAGE_PUBLIC_BASE_URL,
        }),
        source: 'env',
      };
    const legacy = await new QiniuSettingsService(this.db, this.env).getRuntimeSettings();
    return {
      value: storageSettingsSchema.parse(
        legacy
          ? {
              bucket: legacy.bucketName,
              accessKey: legacy.accessKey,
              secretKey: legacy.secretKey,
              defaultPrefix: legacy.defaultPrefix || 'stack/assets',
              publicBaseUrl: legacy.publicBaseUrl,
            }
          : { provider: 'local' },
      ),
      source: legacy ? 'legacy' : 'none',
    };
  }
  async overview() {
    const { value, source } = await this.runtime();
    const { accessKey, secretKey, ...values } = value;
    return {
      configured:
        value.provider === 'local' ||
        (source !== 'legacy' &&
          Boolean(value.region && value.bucket && Boolean(accessKey) === Boolean(secretKey))),
      source,
      values,
      secrets: {
        accessKey: { configured: Boolean(accessKey) },
        secretKey: { configured: Boolean(secretKey) },
      },
    };
  }
  async draft(input: StorageSettings) {
    const { value } = await this.runtime();
    return {
      ...input,
      accessKey: input.accessKey || value.accessKey,
      secretKey: input.secretKey || value.secretKey,
    };
  }
  async save(input: StorageSettings, userId: string) {
    const value = await this.draft(input);
    await this.db
      .insert(systemSettings)
      .values({
        key,
        value: encryptJson(value, getEncryptionKeys(this.env)),
        isEncrypted: true,
        updatedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(value, getEncryptionKeys(this.env)),
          isEncrypted: true,
          updatedByUserId: userId,
          updatedAt: new Date(),
        },
      });
    return this.overview();
  }
}
