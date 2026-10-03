import { z } from 'zod';
import { PaymentProviderSecretStatusSchema } from './settings.js';
import { UserSummarySchema, AppSummarySchema } from './summaries.js';

export const DeliverySettingsOverviewSchema = z.object({
  appCode: z.string(),
  configured: z.boolean(),
  values: z.record(z.string(), z.union([z.string(), z.boolean()])),
  secrets: z.record(z.string(), PaymentProviderSecretStatusSchema),
});

export type DeliverySettingsOverview = z.infer<typeof DeliverySettingsOverviewSchema>;

export const DeploymentTokenSummarySchema = z.object({
  id: z.uuid(),
  tokenHint: z.string(),
  status: z.string(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  usedAt: z.union([z.string(), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type DeploymentTokenSummary = z.infer<typeof DeploymentTokenSummarySchema>;

export const DeploymentSummarySchema = z.object({
  id: z.uuid(),
  label: z.string(),
  environment: z.string(),
  serverHost: z.union([z.string(), z.null()]),
  installPath: z.string(),
  status: z.string(),
  lastTokenIssuedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  lastDeployedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  updatePolicy: z.union([z.literal('manual'), z.literal('auto')]),
  currentRuntimeImages: z.object({
    frontendImage: z.union([z.string(), z.null()]),
    websocketImage: z.union([z.string(), z.null()]),
  }),
  availableRuntimeImages: z.object({
    frontendImage: z.union([z.string(), z.null()]),
    websocketImage: z.union([z.string(), z.null()]),
    offeredAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    appliedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  }),
  runtimeAssets: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      current: z.union([z.string(), z.null()]),
      available: z.union([z.string(), z.null()]),
    }),
  ),
  runtimeAssetsOfferedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  runtimeAssetsAppliedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  currentWordpressAssetReleases: z.record(z.string(), z.union([z.string(), z.null()])),
  availableWordpressAssetReleases: z.record(z.string(), z.union([z.string(), z.null()])),
  pendingAction: z.union([
    z.object({
      id: z.string(),
      kind: z.union([
        z.literal('apply_runtime_images'),
        z.literal('apply_wordpress_assets'),
        z.literal('ignore_runtime_images'),
        z.literal('ignore_wordpress_assets'),
      ]),
      requestedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    }),
    z.null(),
  ]),
  lastAction: z.union([
    z.object({
      id: z.string(),
      kind: z.union([
        z.literal('apply_runtime_images'),
        z.literal('apply_wordpress_assets'),
        z.literal('ignore_runtime_images'),
        z.literal('ignore_wordpress_assets'),
      ]),
      status: z.union([z.literal('completed'), z.literal('failed')]),
      message: z.union([z.string(), z.null()]),
      finishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    }),
    z.null(),
  ]),
  deliveryValues: z.record(z.string(), z.union([z.string(), z.boolean()])),
  domainValues: z.record(z.string(), z.string()),
  configuredSecretKeys: z.array(z.string()),
  domainBinding: z.object({
    sourceField: z.string(),
    sourceLabel: z.union([z.string(), z.null()]),
    scope: z.union([z.literal('registrable_domain'), z.literal('exact_host')]),
    isLocked: z.boolean(),
    boundDomain: z.union([z.string(), z.null()]),
    boundAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  }),
  entitlement: z.union([
    z.object({
      id: z.string(),
      status: z.string(),
      startsAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
      expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
      plan: z.union([
        z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          interval: z.union([z.string(), z.null()]),
        }),
        z.null(),
      ]),
    }),
    z.null(),
  ]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  user: z.union([UserSummarySchema, z.null()]),
  app: z.union([AppSummarySchema, z.null()]),
  latestToken: z.union([DeploymentTokenSummarySchema, z.null()]),
});

export type DeploymentSummary = z.infer<typeof DeploymentSummarySchema>;

export const DeploymentsResponseSchema = z.object({ items: z.array(DeploymentSummarySchema) });

export type DeploymentsResponse = z.infer<typeof DeploymentsResponseSchema>;

export const IssueDeploymentTokenResultSchema = z.object({
  deploymentId: z.string(),
  tokenId: z.string(),
  tokenHint: z.string(),
  token: z.string(),
  exchangeUrl: z.string(),
  exchangeCurl: z.string(),
  remoteInstallCommand: z.union([z.string(), z.null()]),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type IssueDeploymentTokenResult = z.infer<typeof IssueDeploymentTokenResultSchema>;

export const SyncAppDeliveryManifestInputSchema = z.object({
  repoUrl: z.string().optional(),
  repoBranch: z.string().optional(),
  manifestPath: z.string().optional(),
  manifestUrl: z.string().optional(),
});

export type SyncAppDeliveryManifestInput = z.infer<typeof SyncAppDeliveryManifestInputSchema>;

export const UpsertDeliverySettingsInputSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
  installer: z
    .object({ repoUrl: z.string().optional(), repoBranch: z.string().optional() })
    .optional(),
});

export type UpsertDeliverySettingsInput = z.infer<typeof UpsertDeliverySettingsInputSchema>;
