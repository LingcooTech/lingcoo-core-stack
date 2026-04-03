import { z } from 'zod';

export const createDeploymentSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  productCode: z.string().trim().min(1).max(64).optional(),
  label: z.string().trim().min(1).max(120),
  environment: z.string().trim().min(1).max(32).default('production'),
  serverHost: z.string().trim().min(1).max(255).optional(),
  primaryDomain: z.string().trim().min(1).max(255).optional(),
  adminDomain: z.string().trim().min(1).max(255).optional(),
  wsDomain: z.string().trim().min(1).max(255).optional(),
  endpoints: z.record(z.string().trim().min(1).max(64), z.string().trim().min(1).max(255)).optional(),
  installPath: z.string().trim().min(1).max(255).optional()
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
