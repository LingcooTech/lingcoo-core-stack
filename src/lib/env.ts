import { z } from 'zod';

const booleanishEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('fd-core-stack'),
  APP_VERSION: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanishEnv,
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_GLOBAL_WINDOW: z.string().default('1 minute'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(30000),
  JOB_RETENTION_DAYS: z.coerce.number().int().min(7).default(90),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  WORKER_STALE_JOB_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60 * 1000),
  ALERT_DISPATCH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 1000),
  ALERTING_ENABLED: booleanishEnv,
  ALERT_EMAIL_ENABLED: booleanishEnv,
  ALERT_EMAIL_RECIPIENTS: z.string().optional(),
  ALERT_WEBHOOK_ENABLED: booleanishEnv,
  ALERT_WEBHOOK_URL: z.url().optional(),
  ALERT_WEBHOOK_SECRET: z.string().optional(),
  ALERT_MIN_LEVEL: z.enum(['info', 'warning', 'error']).optional(),
  ALERT_COOLDOWN_MINUTES: z.coerce.number().int().positive().optional(),
  PUBLIC_BASE_URL: z.url().default('http://localhost:8080'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  CADDY_SITE_ADDRESS: z.string().default(':80'),
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
  SETTINGS_ENCRYPTION_CURRENT_KEY_ID: z.string().optional(),
  SETTINGS_ENCRYPTION_KEYS: z.string().optional(),
  SETTINGS_ENCRYPTION_LEGACY_KEY: z.string().optional(),
  ALLOW_LEGACY_SETTINGS_DECRYPTION: booleanishEnv,
  API_DOCS_ENABLED: booleanishEnv,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  POSTGRES_DB: z.string().default('fd_core'),
  POSTGRES_USER: z.string().default('fd_core'),
  POSTGRES_PASSWORD: z.string().default('fd_core_password'),
  WECHAT_PAY_MCH_ID: z.string().optional(),
  WECHAT_PAY_APP_ID: z.string().optional(),
  WECHAT_PAY_APP_SECRET: z.string().optional(),
  WECHAT_PAY_KEY: z.string().optional(),
  WECHAT_PAY_DISABLE_H5: booleanishEnv,
  WECHAT_PAY_CERT_SERIAL_NO: z.string().optional(),
  WECHAT_PAY_API_V3_KEY: z.string().optional(),
  WECHAT_PAY_PRIVATE_KEY: z.string().optional(),
  WECHAT_PAY_PLATFORM_CERT: z.string().optional(),
  WECHAT_PAY_PRIVATE_KEY_PATH: z.string().optional(),
  WECHAT_PAY_PLATFORM_CERT_PATH: z.string().optional(),
  WECHAT_PAY_API_BASE_URL: z.string().url().optional(),
  WECHAT_PAY_NOTIFY_URL: z.string().optional(),
  ALIPAY_APP_ID: z.string().optional(),
  ALIPAY_PRIVATE_KEY: z.string().optional(),
  ALIPAY_PUBLIC_KEY: z.string().optional(),
  ALIPAY_PRIVATE_KEY_PATH: z.string().optional(),
  ALIPAY_PUBLIC_KEY_PATH: z.string().optional(),
  ALIPAY_F2F_PAY: booleanishEnv,
  ALIPAY_KEY_TYPE: z.enum(['PKCS1', 'PKCS8']).optional(),
  ALIPAY_GATEWAY: z.string().url().optional(),
  ALIPAY_NOTIFY_URL: z.string().optional(),
  ALIPAY_RETURN_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  QINIU_ACCESS_KEY: z.string().optional(),
  QINIU_SECRET_KEY: z.string().optional(),
  QINIU_BUCKET_NAME: z.string().optional(),
  QINIU_PUBLIC_BASE_URL: z.string().optional(),
  QINIU_UPLOAD_HOST: z.string().optional(),
  QINIU_DEFAULT_PREFIX: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().optional(),
  OPENROUTER_SITE_URL: z.string().optional(),
  OPENROUTER_SITE_NAME: z.string().optional(),
  OPENROUTER_DEFAULT_MODEL: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  return validateEnv(process.env);
}

export function validateEnv(input: Record<string, unknown>): AppEnv {
  const env = envSchema.parse(input);
  if (env.SETTINGS_ENCRYPTION_KEYS) {
    let keys: Record<string, unknown>;
    try {
      keys = JSON.parse(env.SETTINGS_ENCRYPTION_KEYS);
    } catch {
      throw new Error('SETTINGS_ENCRYPTION_KEYS must contain valid keyring JSON');
    }
    if (
      !keys ||
      Array.isArray(keys) ||
      typeof keys !== 'object' ||
      !env.SETTINGS_ENCRYPTION_CURRENT_KEY_ID ||
      typeof keys[env.SETTINGS_ENCRYPTION_CURRENT_KEY_ID] !== 'string' ||
      String(keys[env.SETTINGS_ENCRYPTION_CURRENT_KEY_ID]).length < 32 ||
      keys[env.SETTINGS_ENCRYPTION_CURRENT_KEY_ID] === env.JWT_SECRET ||
      Object.values(keys).some((key) => typeof key !== 'string' || key.length < 16)
    ) {
      throw new Error(
        'Settings keyring must contain an active, independent key of at least 32 characters',
      );
    }
  }
  if (env.NODE_ENV === 'production') {
    if (
      env.JWT_SECRET.length < 32 ||
      /change-this|replace[-_ ]?me|development/i.test(env.JWT_SECRET)
    )
      throw new Error('Production requires a strong JWT signing key');
    if (
      !env.SETTINGS_ENCRYPTION_KEYS &&
      (!env.SETTINGS_ENCRYPTION_KEY ||
        env.SETTINGS_ENCRYPTION_KEY.length < 32 ||
        env.SETTINGS_ENCRYPTION_KEY === env.JWT_SECRET)
    )
      throw new Error('Production requires an independent settings encryption key');
    if (env.CORS_ORIGIN.trim() === '*')
      throw new Error('Production CORS must list explicit origins');
  }
  return env;
}
