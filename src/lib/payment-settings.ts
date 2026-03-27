import { eq } from 'drizzle-orm';

import { systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';
import { decryptJson, encryptJson } from './settings-crypto';

export type PaymentSettingsSource = 'database' | 'env' | 'none';

export type WechatPaymentSettings = {
  mchId: string;
  appId: string;
  certSerialNo: string;
  apiBaseUrl: string;
  notifyUrl: string;
  apiV3Key?: string;
  privateKeyPem?: string;
  platformCertPem?: string;
};

export type AlipayPaymentSettings = {
  appId: string;
  gateway: string;
  notifyUrl: string;
  returnUrl: string;
  keyType: 'PKCS1' | 'PKCS8';
  privateKeyPem?: string;
  publicKeyPem?: string;
};

type SecretStatus = {
  configured: boolean;
};

export type PaymentSettingsOverviewItem =
  | {
      code: 'wechat_pay';
      source: PaymentSettingsSource;
      configured: boolean;
      values: Omit<WechatPaymentSettings, 'apiV3Key' | 'privateKeyPem' | 'platformCertPem'>;
      secrets: {
        apiV3Key: SecretStatus;
        privateKeyPem: SecretStatus;
        platformCertPem: SecretStatus;
      };
    }
  | {
      code: 'alipay';
      source: PaymentSettingsSource;
      configured: boolean;
      values: Omit<AlipayPaymentSettings, 'privateKeyPem' | 'publicKeyPem'>;
      secrets: {
        privateKeyPem: SecretStatus;
        publicKeyPem: SecretStatus;
      };
    };

export type PaymentSettingsOverview = {
  items: PaymentSettingsOverviewItem[];
};

type SystemSettingRow = (typeof systemSettings.$inferSelect) | null;

const WECHAT_KEY = 'billing.provider.wechat_pay';
const ALIPAY_KEY = 'billing.provider.alipay';

function normalizeString(value: string | undefined) {
  return value?.trim() ?? '';
}

function normalizeUrlLikeValue(value: string | undefined) {
  return value?.trim() ?? '';
}

function normalizePem(value: string | undefined) {
  const normalized = value?.replace(/\r\n/g, '\n').trim() ?? '';
  return normalized;
}

function secretConfigured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function readSecretValue(input: { inlineValue?: string; fileValue?: string }) {
  if (secretConfigured(input.inlineValue)) {
    return input.inlineValue!.trim();
  }

  if (secretConfigured(input.fileValue)) {
    return input.fileValue!.trim();
  }

  return '';
}

export class PaymentSettingsService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private getEncryptionSecret() {
    return normalizeString(this.env.SETTINGS_ENCRYPTION_KEY) || this.env.JWT_SECRET;
  }

  private async findSettingRow(key: string) {
    const [row] = await this.db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    return row ?? null;
  }

  private async saveEncryptedSetting(key: string, value: unknown, updatedByUserId: string) {
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key,
        value: encryptJson(value, this.getEncryptionSecret()),
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(value, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now
        }
      });
  }

  private async deleteSetting(key: string) {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, key));
  }

  private decodeSetting<T>(row: Exclude<SystemSettingRow, null>) {
    if (row.isEncrypted) {
      return decryptJson<T>(row.value, this.getEncryptionSecret());
    }

    return row.value as T;
  }

  async getDatabaseWechatSettings() {
    const row = await this.findSettingRow(WECHAT_KEY);
    return row ? this.decodeSetting<WechatPaymentSettings>(row) : null;
  }

  async getDatabaseAlipaySettings() {
    const row = await this.findSettingRow(ALIPAY_KEY);
    return row ? this.decodeSetting<AlipayPaymentSettings>(row) : null;
  }

  private getEnvWechatSettings(): WechatPaymentSettings | null {
    const values: WechatPaymentSettings = {
      mchId: normalizeString(this.env.WECHAT_PAY_MCH_ID),
      appId: normalizeString(this.env.WECHAT_PAY_APP_ID),
      certSerialNo: normalizeString(this.env.WECHAT_PAY_CERT_SERIAL_NO),
      apiBaseUrl: normalizeUrlLikeValue(this.env.WECHAT_PAY_API_BASE_URL) || 'https://api.mch.weixin.qq.com',
      notifyUrl: normalizeUrlLikeValue(this.env.WECHAT_PAY_NOTIFY_URL)
    };

    const apiV3Key = normalizeString(this.env.WECHAT_PAY_API_V3_KEY);
    const privateKeyPem = readSecretValue({
      inlineValue: this.env.WECHAT_PAY_PRIVATE_KEY,
      fileValue: undefined
    });
    const platformCertPem = readSecretValue({
      inlineValue: this.env.WECHAT_PAY_PLATFORM_CERT,
      fileValue: undefined
    });

    if (
      !values.mchId &&
      !values.appId &&
      !values.certSerialNo &&
      !apiV3Key &&
      !privateKeyPem &&
      !platformCertPem &&
      !this.env.WECHAT_PAY_PRIVATE_KEY_PATH &&
      !this.env.WECHAT_PAY_PLATFORM_CERT_PATH
    ) {
      return null;
    }

    return {
      ...values,
      apiV3Key,
      privateKeyPem,
      platformCertPem
    };
  }

  private getEnvAlipaySettings(): AlipayPaymentSettings | null {
    const values: AlipayPaymentSettings = {
      appId: normalizeString(this.env.ALIPAY_APP_ID),
      gateway: normalizeUrlLikeValue(this.env.ALIPAY_GATEWAY) || 'https://openapi.alipay.com/gateway.do',
      notifyUrl: normalizeUrlLikeValue(this.env.ALIPAY_NOTIFY_URL),
      returnUrl: normalizeUrlLikeValue(this.env.ALIPAY_RETURN_URL),
      keyType: this.env.ALIPAY_KEY_TYPE ?? 'PKCS1'
    };

    const privateKeyPem = readSecretValue({
      inlineValue: this.env.ALIPAY_PRIVATE_KEY,
      fileValue: undefined
    });
    const publicKeyPem = readSecretValue({
      inlineValue: this.env.ALIPAY_PUBLIC_KEY,
      fileValue: undefined
    });

    if (
      !values.appId &&
      !privateKeyPem &&
      !publicKeyPem &&
      !this.env.ALIPAY_PRIVATE_KEY_PATH &&
      !this.env.ALIPAY_PUBLIC_KEY_PATH
    ) {
      return null;
    }

    return {
      ...values,
      privateKeyPem,
      publicKeyPem
    };
  }

  async buildRuntimeEnv() {
    const runtimeEnv: AppEnv = { ...this.env };
    const wechat = await this.getDatabaseWechatSettings();
    const alipay = await this.getDatabaseAlipaySettings();

    if (wechat) {
      runtimeEnv.WECHAT_PAY_MCH_ID = wechat.mchId;
      runtimeEnv.WECHAT_PAY_APP_ID = wechat.appId;
      runtimeEnv.WECHAT_PAY_CERT_SERIAL_NO = wechat.certSerialNo;
      runtimeEnv.WECHAT_PAY_API_V3_KEY = wechat.apiV3Key;
      runtimeEnv.WECHAT_PAY_PRIVATE_KEY = wechat.privateKeyPem;
      runtimeEnv.WECHAT_PAY_PLATFORM_CERT = wechat.platformCertPem;
      runtimeEnv.WECHAT_PAY_API_BASE_URL = wechat.apiBaseUrl || undefined;
      runtimeEnv.WECHAT_PAY_NOTIFY_URL = wechat.notifyUrl || undefined;
    }

    if (alipay) {
      runtimeEnv.ALIPAY_APP_ID = alipay.appId;
      runtimeEnv.ALIPAY_PRIVATE_KEY = alipay.privateKeyPem;
      runtimeEnv.ALIPAY_PUBLIC_KEY = alipay.publicKeyPem;
      runtimeEnv.ALIPAY_GATEWAY = alipay.gateway || undefined;
      runtimeEnv.ALIPAY_NOTIFY_URL = alipay.notifyUrl || undefined;
      runtimeEnv.ALIPAY_RETURN_URL = alipay.returnUrl || undefined;
      runtimeEnv.ALIPAY_KEY_TYPE = alipay.keyType;
    }

    return runtimeEnv;
  }

  async upsertWechatSettings(
    input: Partial<WechatPaymentSettings>,
    updatedByUserId: string
  ): Promise<PaymentSettingsOverviewItem> {
    const current = (await this.getDatabaseWechatSettings()) ?? {
      mchId: '',
      appId: '',
      certSerialNo: '',
      apiBaseUrl: 'https://api.mch.weixin.qq.com',
      notifyUrl: '',
      apiV3Key: '',
      privateKeyPem: '',
      platformCertPem: ''
    };

    const next: WechatPaymentSettings = {
      mchId: input.mchId !== undefined ? normalizeString(input.mchId) : current.mchId,
      appId: input.appId !== undefined ? normalizeString(input.appId) : current.appId,
      certSerialNo:
        input.certSerialNo !== undefined ? normalizeString(input.certSerialNo) : current.certSerialNo,
      apiBaseUrl:
        input.apiBaseUrl !== undefined
          ? normalizeUrlLikeValue(input.apiBaseUrl) || 'https://api.mch.weixin.qq.com'
          : current.apiBaseUrl,
      notifyUrl: input.notifyUrl !== undefined ? normalizeUrlLikeValue(input.notifyUrl) : current.notifyUrl,
      apiV3Key: input.apiV3Key ? normalizeString(input.apiV3Key) : current.apiV3Key,
      privateKeyPem: input.privateKeyPem ? normalizePem(input.privateKeyPem) : current.privateKeyPem,
      platformCertPem: input.platformCertPem
        ? normalizePem(input.platformCertPem)
        : current.platformCertPem
    };

    await this.saveEncryptedSetting(WECHAT_KEY, next, updatedByUserId);

    return (await this.getOverview()).items.find((item) => item.code === 'wechat_pay')!;
  }

  async upsertAlipaySettings(
    input: Partial<AlipayPaymentSettings>,
    updatedByUserId: string
  ): Promise<PaymentSettingsOverviewItem> {
    const current = (await this.getDatabaseAlipaySettings()) ?? {
      appId: '',
      gateway: 'https://openapi.alipay.com/gateway.do',
      notifyUrl: '',
      returnUrl: '',
      keyType: 'PKCS1' as const,
      privateKeyPem: '',
      publicKeyPem: ''
    };

    const next: AlipayPaymentSettings = {
      appId: input.appId !== undefined ? normalizeString(input.appId) : current.appId,
      gateway:
        input.gateway !== undefined
          ? normalizeUrlLikeValue(input.gateway) || 'https://openapi.alipay.com/gateway.do'
          : current.gateway,
      notifyUrl: input.notifyUrl !== undefined ? normalizeUrlLikeValue(input.notifyUrl) : current.notifyUrl,
      returnUrl: input.returnUrl !== undefined ? normalizeUrlLikeValue(input.returnUrl) : current.returnUrl,
      keyType: input.keyType ?? current.keyType,
      privateKeyPem: input.privateKeyPem ? normalizePem(input.privateKeyPem) : current.privateKeyPem,
      publicKeyPem: input.publicKeyPem ? normalizePem(input.publicKeyPem) : current.publicKeyPem
    };

    await this.saveEncryptedSetting(ALIPAY_KEY, next, updatedByUserId);

    return (await this.getOverview()).items.find((item) => item.code === 'alipay')!;
  }

  async clearProviderSettings(provider: 'wechat_pay' | 'alipay') {
    await this.deleteSetting(provider === 'wechat_pay' ? WECHAT_KEY : ALIPAY_KEY);
  }

  async getOverview(): Promise<PaymentSettingsOverview> {
    const wechatFromDb = await this.getDatabaseWechatSettings();
    const alipayFromDb = await this.getDatabaseAlipaySettings();
    const wechat = wechatFromDb ?? this.getEnvWechatSettings();
    const alipay = alipayFromDb ?? this.getEnvAlipaySettings();

    const wechatSource: PaymentSettingsSource = wechatFromDb
      ? 'database'
      : wechat
        ? 'env'
        : 'none';
    const alipaySource: PaymentSettingsSource = alipayFromDb
      ? 'database'
      : alipay
        ? 'env'
        : 'none';

    return {
      items: [
        {
          code: 'wechat_pay',
          source: wechatSource,
          configured: Boolean(
            wechat?.mchId &&
              wechat.appId &&
              wechat.certSerialNo &&
              secretConfigured(wechat.apiV3Key) &&
              (secretConfigured(wechat.privateKeyPem) || secretConfigured(this.env.WECHAT_PAY_PRIVATE_KEY_PATH)) &&
              (secretConfigured(wechat.platformCertPem) ||
                secretConfigured(this.env.WECHAT_PAY_PLATFORM_CERT_PATH))
          ),
          values: {
            mchId: wechat?.mchId ?? '',
            appId: wechat?.appId ?? '',
            certSerialNo: wechat?.certSerialNo ?? '',
            apiBaseUrl: wechat?.apiBaseUrl || 'https://api.mch.weixin.qq.com',
            notifyUrl: wechat?.notifyUrl ?? ''
          },
          secrets: {
            apiV3Key: {
              configured: secretConfigured(wechat?.apiV3Key)
            },
            privateKeyPem: {
              configured: secretConfigured(wechat?.privateKeyPem) || secretConfigured(this.env.WECHAT_PAY_PRIVATE_KEY_PATH)
            },
            platformCertPem: {
              configured:
                secretConfigured(wechat?.platformCertPem) || secretConfigured(this.env.WECHAT_PAY_PLATFORM_CERT_PATH)
            }
          }
        },
        {
          code: 'alipay',
          source: alipaySource,
          configured: Boolean(
            alipay?.appId &&
              (secretConfigured(alipay.privateKeyPem) || secretConfigured(this.env.ALIPAY_PRIVATE_KEY_PATH)) &&
              (secretConfigured(alipay.publicKeyPem) || secretConfigured(this.env.ALIPAY_PUBLIC_KEY_PATH))
          ),
          values: {
            appId: alipay?.appId ?? '',
            gateway: alipay?.gateway || 'https://openapi.alipay.com/gateway.do',
            notifyUrl: alipay?.notifyUrl ?? '',
            returnUrl: alipay?.returnUrl ?? '',
            keyType: alipay?.keyType ?? 'PKCS1'
          },
          secrets: {
            privateKeyPem: {
              configured: secretConfigured(alipay?.privateKeyPem) || secretConfigured(this.env.ALIPAY_PRIVATE_KEY_PATH)
            },
            publicKeyPem: {
              configured: secretConfigured(alipay?.publicKeyPem) || secretConfigured(this.env.ALIPAY_PUBLIC_KEY_PATH)
            }
          }
        }
      ]
    };
  }
}
