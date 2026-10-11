import { z } from 'zod';
import { deploymentModeSchema, hostedPrefixSchema, serverIpSchema } from './hosting.js';

export const createDeploymentSchema = z
  .object({
    appCode: z.string().trim().min(1).max(64),
    entitlementId: z.string().uuid(),
    hostingPurchaseId: z.uuid().optional(),
    label: z.string().trim().min(1).max(120),
    environment: z.string().trim().min(1).max(32).default('production'),
    deploymentMode: deploymentModeSchema.default('self_hosted'),
    hostedPrefix: hostedPrefixSchema.optional(),
    serverHost: serverIpSchema.optional(),
    installPath: z.string().trim().min(1).max(255).optional(),
    updatePolicy: z.enum(['manual', 'auto']).optional(),
    domainValues: z.record(z.string(), z.string().trim().min(1).max(255)).optional(),
    values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    secrets: z.record(z.string(), z.string().trim().min(1).max(4096)).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.deploymentMode === 'self_hosted' && value.hostingPurchaseId)
      ctx.addIssue({ code: 'custom', message: '自有服务器不消耗托管资格' });
    if (value.deploymentMode === 'self_hosted' && !value.serverHost) {
      ctx.addIssue({ code: 'custom', path: ['serverHost'], message: '请填写自有服务器 IP' });
    }
    if (value.deploymentMode === 'self_hosted' && value.hostedPrefix) {
      ctx.addIssue({
        code: 'custom',
        path: ['hostedPrefix'],
        message: '自有服务器不分配托管子域名',
      });
    }
    if (
      value.deploymentMode === 'managed' &&
      (value.serverHost || value.installPath || Object.keys(value.domainValues ?? {}).length)
    ) {
      ctx.addIssue({ code: 'custom', message: '托管服务器、安装路径和域名由平台分配' });
    }
  });

export const updateDeploymentSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(32).optional(),
    serverHost: z.string().trim().min(1).max(255).optional(),
    installPath: z.string().trim().min(1).max(255).optional(),
    updatePolicy: z.enum(['manual', 'auto']).optional(),
    domainValues: z.record(z.string(), z.string().trim().min(1).max(255)).optional(),
    values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    secrets: z.record(z.string(), z.string().trim().min(1).max(4096)).optional(),
  })
  .strict();

export const deploymentParamsSchema = z.object({
  deploymentId: z.string().uuid(),
});

export const issueDeploymentTokenSchema = z.object({
  expiresInHours: z.coerce.number().int().min(1).max(168).default(2),
});

export const exchangeDeploymentTokenSchema = z.object({
  token: z.string().trim().min(16).max(255),
});

export const reportDeploymentStatusSchema = z
  .object({
    deploymentId: z.string().uuid(),
    token: z.string().trim().min(16).max(255),
    runtimeHealth: z.enum(['ready', 'unhealthy']).optional(),
    runtimeAssets: z
      .object({
        current: z.record(z.string(), z.string().trim().min(1).max(4096).nullable()).optional(),
        available: z.record(z.string(), z.string().trim().min(1).max(4096).nullable()).optional(),
        offeredAt: z.string().trim().min(1).max(255).nullable().optional(),
        appliedAt: z.string().trim().min(1).max(255).nullable().optional(),
      })
      .optional(),
  })
  .strict();

export const requestDeploymentActionSchema = z.object({
  kind: z.enum(['apply_runtime_images', 'ignore_runtime_images']),
});

export const pullDeploymentActionSchema = z.object({
  deploymentId: z.string().uuid(),
  token: z.string().trim().min(16).max(255),
});

export const completeDeploymentActionSchema = z.object({
  deploymentId: z.string().uuid(),
  token: z.string().trim().min(16).max(255),
  actionId: z.string().trim().min(8).max(255),
  status: z.enum(['completed', 'failed']),
  message: z.string().trim().max(2000).optional(),
});
