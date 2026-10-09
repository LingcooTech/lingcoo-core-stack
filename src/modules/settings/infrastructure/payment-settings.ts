import fs from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { systemSettings } from '../../../db/schema';
import type { DbExecutor } from '../../../db/types';
import type { AppEnv } from '../../../lib/env';
import { httpError } from '../../../lib/errors';
import { decryptJson, encryptJson, getEncryptionKeys } from '../../../lib/settings-crypto';

export type PaymentSettingsSource = 'database' | 'env' | 'none';

export type WechatPaymentSettings = {
  enabled: boolean;
  appId: string;
  appSecret?: string; // retained only for reading legacy settings
  apiV3Key?: string;
  merchantSerial?: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  publicKeyId?: string;

  mchId: string;
  apiKey?: string;
  disableH5: boolean;
  notifyUrl: string;
};

export type AlipayPaymentSettings = {
  appId: string;
  gateway: string;
  notifyUrl: string;
  returnUrl: string;
  keyType: 'PKCS1' | 'PKCS8';
  f2fPay: boolean;
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
      values: Pick<
        WechatPaymentSettings,
        'enabled' | 'appId' | 'mchId' | 'disableH5' | 'merchantSerial' | 'publicKeyId' | 'notifyUrl'
      >;
      secrets: {
        appSecret: SecretStatus;
        apiKey: SecretStatus;
        apiV3Key: SecretStatus;
        privateKeyPem: SecretStatus;
        publicKeyPem: SecretStatus;
      };
    }
  | {
      code: 'alipay';
      source: PaymentSettingsSource;
      configured: boolean;
      values: Pick<AlipayPaymentSettings, 'appId' | 'f2fPay'>;
      secrets: {
        privateKeyPem: SecretStatus;
        publicKeyPem: SecretStatus;
      };
    };

export type PaymentSettingsOverview = {
  items: PaymentSettingsOverviewItem[];
};

type SystemSettingRow = typeof systemSettings.$inferSelect | null;

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

function normalizeBoolean(value: unknown, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return defaultValue;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

function secretConfigured(value: string | undefined) {
  return Boolean(value?.trim());
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function resolvePath(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function fileSecretConfigured(filePath: string | undefined) {
  if (!secretConfigured(filePath)) {
    return false;
  }

  try {
    return fs.existsSync(resolvePath(filePath!.trim()));
  } catch {
    return false;
  }
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

function configuredPem(inline: string | undefined, filePath: string | undefined) {
  if (inline?.trim()) return normalizePem(inline);
  if (!filePath?.trim()) return '';
  try {
    return normalizePem(fs.readFileSync(resolvePath(filePath.trim()), 'utf8'));
  } catch {
    return '';
  }
}

export class PaymentSettingsService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  private getEncryptionSecret() {
    return getEncryptionKeys(this.env);
  }

  private async findSettingRow(key: string) {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
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
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(value, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now,
        },
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

  private normalizeWechatSettings(value: unknown): WechatPaymentSettings | null {
    const raw = normalizeObject(value);
    const appId = normalizeString(String(raw.appId ?? raw.appid ?? ''));
    const appSecret = normalizeString(String(raw.appSecret ?? raw.secret ?? ''));
    const mchId = normalizeString(String(raw.mchId ?? raw.mchid ?? ''));
    const apiKey = normalizeString(String(raw.apiKey ?? raw.key ?? ''));
    const disableH5 = normalizeBoolean(raw.disableH5 ?? raw.disable_h5, false);
    const notifyUrl = normalizeUrlLikeValue(String(raw.notifyUrl ?? ''));

    if (Object.keys(raw).length === 0) {
      return null;
    }

    return {
      enabled: normalizeBoolean(raw.enabled, true), // legacy configurations were always enabled
      apiV3Key: String(raw.apiV3Key ?? ''),
      merchantSerial: normalizeString(String(raw.merchantSerial ?? '')),
      privateKeyPem: normalizePem(String(raw.privateKeyPem ?? '')),
      publicKeyPem: normalizePem(String(raw.publicKeyPem ?? '')),
      publicKeyId: normalizeString(String(raw.publicKeyId ?? '')),
      appId,
      appSecret,
      mchId,
      apiKey,
      disableH5,
      notifyUrl,
    };
  }

  private normalizeAlipaySettings(value: unknown): AlipayPaymentSettings | null {
    const raw = normalizeObject(value);
    const appId = normalizeString(String(raw.appId ?? raw.appid ?? ''));
    const privateKeyPem = normalizePem(String(raw.privateKeyPem ?? raw.privateKey ?? ''));
    const publicKeyPem = normalizePem(String(raw.publicKeyPem ?? raw.publicKey ?? ''));
    const gateway = 'https://openapi.alipay.com/gateway.do';
    const notifyUrl = '';
    const returnUrl = '';
    const keyType = raw.keyType === 'PKCS8' ? 'PKCS8' : 'PKCS1';
    const f2fPay = normalizeBoolean(raw.f2fPay ?? raw.f2fpay, false);

    if (!appId && !privateKeyPem && !publicKeyPem) {
      return null;
    }

    return {
      appId,
      gateway,
      notifyUrl,
      returnUrl,
      keyType,
      f2fPay,
      privateKeyPem,
      publicKeyPem,
    };
  }

  async getDatabaseWechatSettings() {
    const row = await this.findSettingRow(WECHAT_KEY);
    return row ? this.normalizeWechatSettings(this.decodeSetting<unknown>(row)) : null;
  }

  async getDatabaseAlipaySettings() {
    const row = await this.findSettingRow(ALIPAY_KEY);
    return row ? this.normalizeAlipaySettings(this.decodeSetting<unknown>(row)) : null;
  }

  private getEnvWechatSettings(): WechatPaymentSettings | null {
    const values: WechatPaymentSettings = {
      enabled: this.env.WECHAT_PAY_ENABLED ?? true,
      appId: normalizeString(this.env.WECHAT_PAY_APP_ID),
      appSecret: normalizeString(this.env.WECHAT_PAY_APP_SECRET),
      mchId: normalizeString(this.env.WECHAT_PAY_MCH_ID),
      apiKey: normalizeString(this.env.WECHAT_PAY_KEY),
      apiV3Key: this.env.WECHAT_PAY_API_V3_KEY ?? '',
      merchantSerial: normalizeString(this.env.WECHAT_PAY_CERT_SERIAL_NO),
      privateKeyPem: configuredPem(
        this.env.WECHAT_PAY_PRIVATE_KEY,
        this.env.WECHAT_PAY_PRIVATE_KEY_PATH,
      ),
      publicKeyPem: configuredPem(
        this.env.WECHAT_PAY_PLATFORM_CERT,
        this.env.WECHAT_PAY_PLATFORM_CERT_PATH,
      ),
      publicKeyId: normalizeString(this.env.WECHAT_PAY_PUBLIC_KEY_ID),
      disableH5: normalizeBoolean(this.env.WECHAT_PAY_DISABLE_H5, false),
      notifyUrl: normalizeUrlLikeValue(this.env.WECHAT_PAY_NOTIFY_URL),
    };

    if (
      !values.mchId &&
      !values.appId &&
      !values.appSecret &&
      !values.apiKey &&
      !values.notifyUrl &&
      !values.apiV3Key &&
      !values.merchantSerial &&
      !values.privateKeyPem &&
      !values.publicKeyPem &&
      !values.publicKeyId &&
      this.env.WECHAT_PAY_ENABLED === undefined
    ) {
      return null;
    }

    return values;
  }

  private getEnvAlipaySettings(): AlipayPaymentSettings | null {
    const values: AlipayPaymentSettings = {
      appId: normalizeString(this.env.ALIPAY_APP_ID),
      gateway:
        normalizeUrlLikeValue(this.env.ALIPAY_GATEWAY) || 'https://openapi.alipay.com/gateway.do',
      notifyUrl: normalizeUrlLikeValue(this.env.ALIPAY_NOTIFY_URL),
      returnUrl: normalizeUrlLikeValue(this.env.ALIPAY_RETURN_URL),
      keyType: this.env.ALIPAY_KEY_TYPE ?? 'PKCS1',
      f2fPay: normalizeBoolean(this.env.ALIPAY_F2F_PAY, false),
    };

    const privateKeyPem = readSecretValue({
      inlineValue: this.env.ALIPAY_PRIVATE_KEY,
      fileValue: undefined,
    });
    const publicKeyPem = readSecretValue({
      inlineValue: this.env.ALIPAY_PUBLIC_KEY,
      fileValue: undefined,
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
      publicKeyPem,
    };
  }

  async buildRuntimeEnv() {
    const runtimeEnv: AppEnv = { ...this.env };
    const wechat = await this.getDatabaseWechatSettings();
    const alipay = await this.getDatabaseAlipaySettings();

    if (wechat) {
      runtimeEnv.WECHAT_PAY_ENABLED = wechat.enabled;
      runtimeEnv.WECHAT_PAY_MCH_ID = wechat.mchId;
      runtimeEnv.WECHAT_PAY_APP_ID = wechat.appId;
      runtimeEnv.WECHAT_PAY_APP_SECRET = wechat.appSecret;
      runtimeEnv.WECHAT_PAY_KEY = undefined;
      runtimeEnv.WECHAT_PAY_API_V3_KEY = wechat.apiV3Key;
      runtimeEnv.WECHAT_PAY_CERT_SERIAL_NO = wechat.merchantSerial;
      runtimeEnv.WECHAT_PAY_PRIVATE_KEY = wechat.privateKeyPem;
      runtimeEnv.WECHAT_PAY_PLATFORM_CERT = wechat.publicKeyPem;
      runtimeEnv.WECHAT_PAY_PUBLIC_KEY_ID = wechat.publicKeyId;
      runtimeEnv.WECHAT_PAY_PRIVATE_KEY_PATH = undefined;
      runtimeEnv.WECHAT_PAY_PLATFORM_CERT_PATH = undefined;
      runtimeEnv.WECHAT_PAY_DISABLE_H5 = wechat.disableH5;
      runtimeEnv.WECHAT_PAY_NOTIFY_URL = wechat.notifyUrl || undefined;
    }

    if (alipay) {
      runtimeEnv.ALIPAY_APP_ID = alipay.appId;
      runtimeEnv.ALIPAY_PRIVATE_KEY = alipay.privateKeyPem;
      runtimeEnv.ALIPAY_PUBLIC_KEY = alipay.publicKeyPem;
      runtimeEnv.ALIPAY_GATEWAY = alipay.gateway || undefined;
      runtimeEnv.ALIPAY_NOTIFY_URL = alipay.notifyUrl || undefined;
      runtimeEnv.ALIPAY_RETURN_URL = alipay.returnUrl || undefined;
      runtimeEnv.ALIPAY_F2F_PAY = alipay.f2fPay;
      runtimeEnv.ALIPAY_KEY_TYPE = alipay.keyType;
    }

    return runtimeEnv;
  }

  async upsertWechatSettings(
    input: Partial<WechatPaymentSettings>,
    updatedByUserId: string,
  ): Promise<PaymentSettingsOverviewItem> {
    const current = (await this.getDatabaseWechatSettings()) ??
      this.getEnvWechatSettings() ?? {
        enabled: false,
        appId: '',
        appSecret: '',
        mchId: '',
        apiKey: '',
        disableH5: false,
        notifyUrl: '',
      };

    for (const [name, pem] of [
      ['privateKeyPem', input.privateKeyPem],
      ['publicKeyPem', input.publicKeyPem],
    ] as const) {
      if (!pem) continue;
      try {
        const key = name === 'privateKeyPem' ? createPrivateKey(pem) : createPublicKey(pem);
        if (name === 'publicKeyPem' && pem.includes('PRIVATE KEY'))
          throw new Error('Expected public key');
        if (
          key.asymmetricKeyType !== 'rsa' ||
          (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
        )
          throw new Error('Expected RSA 2048+');
      } catch {
        throw httpError(
          400,
          name === 'privateKeyPem'
            ? '商户私钥须为有效的 RSA 2048 位或以上 PEM 私钥'
            : '微信支付公钥须为有效的 RSA 2048 位或以上 PEM 公钥或平台证书',
        );
      }
    }
    const next: WechatPaymentSettings = {
      enabled: input.enabled ?? current.enabled,
      apiV3Key: input.apiV3Key || current.apiV3Key,
      merchantSerial:
        input.merchantSerial !== undefined
          ? normalizeString(input.merchantSerial)
          : current.merchantSerial,
      privateKeyPem: input.privateKeyPem
        ? normalizePem(input.privateKeyPem)
        : current.privateKeyPem,
      publicKeyPem: input.publicKeyPem ? normalizePem(input.publicKeyPem) : current.publicKeyPem,
      publicKeyId:
        input.publicKeyId !== undefined ? normalizeString(input.publicKeyId) : current.publicKeyId,
      appId: input.appId !== undefined ? normalizeString(input.appId) : current.appId,
      appSecret: input.appSecret ? normalizeString(input.appSecret) : current.appSecret,
      mchId: input.mchId !== undefined ? normalizeString(input.mchId) : current.mchId,
      apiKey: input.apiKey ? normalizeString(input.apiKey) : current.apiKey,
      disableH5: input.disableH5 ?? current.disableH5,
      notifyUrl:
        input.notifyUrl !== undefined ? normalizeUrlLikeValue(input.notifyUrl) : current.notifyUrl,
    };

    await this.saveEncryptedSetting(WECHAT_KEY, next, updatedByUserId);

    return (await this.getOverview()).items.find((item) => item.code === 'wechat_pay')!;
  }

  async upsertAlipaySettings(
    input: Partial<AlipayPaymentSettings>,
    updatedByUserId: string,
  ): Promise<PaymentSettingsOverviewItem> {
    const current = (await this.getDatabaseAlipaySettings()) ??
      this.getEnvAlipaySettings() ?? {
        appId: '',
        gateway: 'https://openapi.alipay.com/gateway.do',
        notifyUrl: '',
        returnUrl: '',
        keyType: 'PKCS1' as const,
        f2fPay: false,
        privateKeyPem: '',
        publicKeyPem: '',
      };

    const next: AlipayPaymentSettings = {
      appId: input.appId !== undefined ? normalizeString(input.appId) : current.appId,
      gateway:
        input.gateway !== undefined
          ? normalizeUrlLikeValue(input.gateway) || 'https://openapi.alipay.com/gateway.do'
          : current.gateway,
      notifyUrl:
        input.notifyUrl !== undefined ? normalizeUrlLikeValue(input.notifyUrl) : current.notifyUrl,
      returnUrl:
        input.returnUrl !== undefined ? normalizeUrlLikeValue(input.returnUrl) : current.returnUrl,
      keyType: input.keyType ?? current.keyType,
      f2fPay: input.f2fPay ?? current.f2fPay,
      privateKeyPem: input.privateKeyPem
        ? normalizePem(input.privateKeyPem)
        : current.privateKeyPem,
      publicKeyPem: input.publicKeyPem ? normalizePem(input.publicKeyPem) : current.publicKeyPem,
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

    const wechatSource: PaymentSettingsSource = wechatFromDb ? 'database' : wechat ? 'env' : 'none';
    const alipaySource: PaymentSettingsSource = alipayFromDb ? 'database' : alipay ? 'env' : 'none';

    return {
      items: [
        {
          code: 'wechat_pay',
          source: wechatSource,
          configured: Boolean(
            wechat?.mchId &&
            wechat.appId &&
            Buffer.byteLength(wechat.apiV3Key ?? '') === 32 &&
            wechat.merchantSerial &&
            (wechat.privateKeyPem ||
              (wechatSource === 'env' &&
                fileSecretConfigured(this.env.WECHAT_PAY_PRIVATE_KEY_PATH))) &&
            (wechat.publicKeyPem ||
              (wechatSource === 'env' &&
                fileSecretConfigured(this.env.WECHAT_PAY_PLATFORM_CERT_PATH))) &&
            wechat.publicKeyId,
          ),
          values: {
            enabled: wechat?.enabled ?? false,
            notifyUrl:
              wechat?.notifyUrl ||
              new URL('/v1/billing/providers/wechat/notify', this.env.PUBLIC_BASE_URL).toString(),
            appId: wechat?.appId ?? '',
            mchId: wechat?.mchId ?? '',
            merchantSerial: wechat?.merchantSerial ?? '',
            publicKeyId: wechat?.publicKeyId ?? '',
            disableH5: wechat?.disableH5 ?? false,
          },
          secrets: {
            apiV3Key: { configured: secretConfigured(wechat?.apiV3Key) },
            privateKeyPem: {
              configured:
                secretConfigured(wechat?.privateKeyPem) ||
                (wechatSource === 'env' &&
                  fileSecretConfigured(this.env.WECHAT_PAY_PRIVATE_KEY_PATH)),
            },
            publicKeyPem: {
              configured:
                secretConfigured(wechat?.publicKeyPem) ||
                (wechatSource === 'env' &&
                  fileSecretConfigured(this.env.WECHAT_PAY_PLATFORM_CERT_PATH)),
            },
            appSecret: {
              configured: secretConfigured(wechat?.appSecret),
            },
            apiKey: {
              configured: secretConfigured(wechat?.apiKey),
            },
          },
        },
        {
          code: 'alipay',
          source: alipaySource,
          configured: Boolean(
            alipay?.appId &&
            (secretConfigured(alipay.privateKeyPem) ||
              fileSecretConfigured(this.env.ALIPAY_PRIVATE_KEY_PATH)) &&
            (secretConfigured(alipay.publicKeyPem) ||
              fileSecretConfigured(this.env.ALIPAY_PUBLIC_KEY_PATH)),
          ),
          values: {
            appId: alipay?.appId ?? '',
            f2fPay: alipay?.f2fPay ?? false,
          },
          secrets: {
            privateKeyPem: {
              configured:
                secretConfigured(alipay?.privateKeyPem) ||
                fileSecretConfigured(this.env.ALIPAY_PRIVATE_KEY_PATH),
            },
            publicKeyPem: {
              configured:
                secretConfigured(alipay?.publicKeyPem) ||
                fileSecretConfigured(this.env.ALIPAY_PUBLIC_KEY_PATH),
            },
          },
        },
      ],
    };
  }
}
