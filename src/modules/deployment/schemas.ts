import { z } from 'zod';

export const createDeploymentSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  environment: z.string().trim().min(1).max(32).default('production'),
  serverHost: z.string().trim().min(1).max(255).optional(),
  primaryDomain: z.string().trim().min(1).max(255).optional(),
  adminDomain: z.string().trim().min(1).max(255).optional(),
  wsDomain: z.string().trim().min(1).max(255).optional(),
  installPath: z.string().trim().min(1).max(255).optional(),
  updatePolicy: z.enum(['manual', 'auto']).optional(),
  values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  secrets: z.record(z.string(), z.string().trim().min(1).max(4096)).optional()
});

export const updateDeploymentSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  environment: z.string().trim().min(1).max(32).optional(),
  serverHost: z.string().trim().min(1).max(255).optional(),
  primaryDomain: z.string().trim().min(1).max(255).optional(),
  adminDomain: z.string().trim().min(1).max(255).optional(),
  wsDomain: z.string().trim().min(1).max(255).optional(),
  installPath: z.string().trim().min(1).max(255).optional(),
  updatePolicy: z.enum(['manual', 'auto']).optional(),
  values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  secrets: z.record(z.string(), z.string().trim().min(1).max(4096)).optional()
});

export const deploymentParamsSchema = z.object({
  deploymentId: z.string().uuid()
});

export const issueDeploymentTokenSchema = z.object({
  expiresInHours: z.coerce.number().int().min(1).max(168).default(2)
});

export const exchangeDeploymentTokenSchema = z.object({
  token: z.string().trim().min(16).max(255)
});

export const reportDeploymentStatusSchema = z.object({
  deploymentId: z.string().uuid(),
  token: z.string().trim().min(16).max(255),
  runtimeImages: z
    .object({
      currentFrontendImage: z.string().trim().min(1).max(4096).nullable().optional(),
      currentWebsocketImage: z.string().trim().min(1).max(4096).nullable().optional(),
      availableFrontendImage: z.string().trim().min(1).max(4096).nullable().optional(),
      availableWebsocketImage: z.string().trim().min(1).max(4096).nullable().optional(),
      offeredAt: z.string().trim().min(1).max(255).nullable().optional(),
      appliedAt: z.string().trim().min(1).max(255).nullable().optional()
    })
    .optional(),
  wordpressAssets: z
    .object({
      current: z.record(z.string(), z.string().trim().min(1).max(255).nullable()).optional(),
      available: z.record(z.string(), z.string().trim().min(1).max(255).nullable()).optional(),
      offeredAt: z.string().trim().min(1).max(255).nullable().optional(),
      appliedAt: z.string().trim().min(1).max(255).nullable().optional()
    })
    .optional()
});

export const requestDeploymentActionSchema = z.object({
  kind: z.enum(['apply_runtime_images', 'apply_wordpress_assets'])
});

export const pullDeploymentActionSchema = z.object({
  deploymentId: z.string().uuid(),
  token: z.string().trim().min(16).max(255)
});

export const completeDeploymentActionSchema = z.object({
  deploymentId: z.string().uuid(),
  token: z.string().trim().min(16).max(255),
  actionId: z.string().trim().min(8).max(255),
  status: z.enum(['completed', 'failed']),
  message: z.string().trim().max(2000).optional()
});
