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
  PUBLIC_BASE_URL: z.url().default('http://localhost:8080'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  CADDY_SITE_ADDRESS: z.string().default(':80'),
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
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
  ALIYUN_ACCESS_KEY_ID: z.string().optional(),
  ALIYUN_ACCESS_KEY_SECRET: z.string().optional(),
  ACR_REGION_ID: z.string().optional(),
  ACR_INSTANCE_ID: z.string().optional(),
  ACR_OPENAPI_ENDPOINT: z.string().optional()
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}
