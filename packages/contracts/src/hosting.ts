import { hostingMonitorProfileSchema } from './hosting-monitor.js';
import { z } from 'zod';

export const deploymentModeSchema = z.enum(['self_hosted', 'managed']);
export const serverIpSchema = z.union([z.ipv4(), z.ipv6()]);
const reservedPrefixes = new Set([
  'www',
  'admin',
  'api',
  'stack',
  'app',
  'mail',
  'support',
  'status',
]);
export const hostedPrefixSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, '使用字母开头的小写字母、数字和单个连字符')
  .refine((value) => !reservedPrefixes.has(value), '此前缀为平台保留名称');
export const hostingResourcesSchema = z
  .object({
    cpuMillis: z.number().int().min(100).max(128000),
    memoryMb: z.number().int().min(128).max(1048576),
    diskMb: z.number().int().min(1024).max(104857600),
  })
  .strict();
export const hostingProfileSchema = z
  .object({
    enabled: z.literal(true),
    domainField: z.string().min(1).max(64),
    monitoring: hostingMonitorProfileSchema.optional(),
    resources: hostingResourcesSchema,
  })
  .strict();
export const hostingAssetSchema = z
  .object({
    provider: z.string().trim().max(80).default(''),
    region: z.string().trim().max(80).default(''),
    purpose: z.string().trim().max(160).default(''),
    monthlyCostCents: z.number().int().min(0).max(100000000).nullable().default(null),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();
export const hostingCertificateSchema = z
  .object({
    domain: z.string().max(255),
    fingerprint: z.string().max(128),
    expiresAt: z.iso.datetime({ offset: true }),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const hostingContainerSchema = z
  .object({
    name: z.string().max(200),
    project: z.string().max(200),
    service: z.string().max(80),
    state: z.string().max(32),
    health: z.string().max(32),
    image: z.string().max(512),
    memoryMb: z.number().min(0).max(1048576),
    cpuPercent: z.number().min(0).max(12800),
    restarts: z.number().int().min(0),
  })
  .strict();
export const hostingBackupStatusSchema = z
  .object({
    deploymentId: z.uuid(),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    status: z.enum(['success', 'failed', 'never']),
    offsiteAt: z.iso.datetime({ offset: true }).nullable(),
    offsiteStatus: z.enum(['success', 'failed', 'not_configured', 'pending']),
  })
  .strict();
export const createHostingNodeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    serverIp: serverIpSchema,
    capacity: hostingResourcesSchema,
    asset: hostingAssetSchema.optional(),
  })
  .strict();
export const hostingNodeReportSchema = z
  .object({
    dockerReady: z.boolean(),
    canDeploy: z.boolean().optional(),
    totals: hostingResourcesSchema.optional(),
    load1: z.number().min(0).max(10000).optional(),
    containers: z.array(hostingContainerSchema).max(1000).optional(),
    certificate: hostingCertificateSchema.nullable().optional(),
    certificateAutomation: z
      .object({
        status: z.enum(['success', 'failed']),
        checkedAt: z.string().datetime({ offset: true }),
      })
      .nullable()
      .optional(),
    backups: z.array(hostingBackupStatusSchema).max(500).optional(),
    available: hostingResourcesSchema.extend({
      cpuMillis: z.number().int().min(0).max(128000),
      memoryMb: z.number().int().min(0).max(1048576),
      diskMb: z.number().int().min(0).max(104857600),
    }),
  })
  .strict();
export const hostingNodeStateSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().trim().min(1).max(80).optional(),
    capacity: hostingResourcesSchema.optional(),
    asset: hostingAssetSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '没有需要更新的字段');
export const hostingNodeParamsSchema = z.object({ nodeId: z.uuid() });
export const ManagedDeploymentSchema = z.object({
  prefix: z.string(),
  hostname: z.string(),
  state: z.enum([
    'waiting_capacity',
    'pending_infrastructure',
    'deploying',
    'runtime_ready',
    'pending_tls',
    'ready',
    'failed',
    'cancelled',
  ]),
  nodeAssigned: z.boolean(),
  accessUrl: z.string().nullable(),
});
export type ManagedDeployment = z.infer<typeof ManagedDeploymentSchema>;
export const HostingNodeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  serverIp: z.string(),
  enabled: z.boolean(),
  capacity: hostingResourcesSchema,
  reserved: hostingNodeReportSchema.shape.available,
  available: hostingNodeReportSchema.shape.available.nullable(),
  healthy: z.boolean(),
  asset: hostingAssetSchema,
  telemetry: hostingNodeReportSchema.nullable(),
  alerts: z.array(
    z.object({ code: z.string(), severity: z.enum(['warning', 'critical']), message: z.string() }),
  ),
  lastReportedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const HostingNodesResponseSchema = z.object({ items: z.array(HostingNodeSchema) });
export const HostingNodeCreatedSchema = z.object({
  node: HostingNodeSchema,
  reportToken: z.string(),
});
export const DeploymentOptionsSchema = z.object({
  modes: z.array(deploymentModeSchema),
  managedDomainSuffix: z.string(),
});
export type HostingResources = z.infer<typeof hostingResourcesSchema>;
export type HostingNode = z.infer<typeof HostingNodeSchema>;

export const HostingJobSchema = z.object({
  id: z.uuid(),
  deploymentId: z.uuid(),
  appCode: z.string(),
  hostname: z.string(),
  resources: hostingResourcesSchema,
  env: z.record(z.string(), z.string()),
});
export type HostingJob = z.infer<typeof HostingJobSchema>;
export const HostingClaimSchema = z.object({ job: HostingJobSchema.nullable() });
export const hostingCompletionSchema = z
  .object({
    deploymentId: z.uuid(),
    jobId: z.uuid(),
    success: z.boolean(),
    image: z.string().max(512).optional(),
  })
  .strict();

export const customHostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    '请填写域名，不包含协议、端口或路径',
  );
export const addDeploymentDomainSchema = z.object({ hostname: customHostnameSchema }).strict();
export const DeploymentDomainSchema = z.object({
  id: z.uuid(),
  hostname: z.string(),
  state: z.enum(['pending_dns', 'pending_tls', 'ready', 'removing']),
  verificationName: z.string(),
  verificationValue: z.string(),
  cnameTarget: z.string(),
  ipv4Target: z.string().nullable(),
  accessUrl: z.string().nullable(),
});
export const DeploymentDomainsSchema = z.object({ items: z.array(DeploymentDomainSchema) });
export type DeploymentDomain = z.infer<typeof DeploymentDomainSchema>;
export const HostingIngressItemSchema = z.object({
  deploymentId: z.uuid(),
  hostname: z.string(),
  aliases: z.array(z.object({ id: z.uuid(), hostname: z.string() })).default([]),
  removals: z.array(z.object({ id: z.uuid(), hostname: z.string() })).default([]),
});

export const hostingOperationKindSchema = z.enum(['restart', 'backup']);
export const hostingOperationRequestSchema = z
  .object({
    kind: hostingOperationKindSchema,
    requestKey: z.uuid(),
  })
  .strict();
export const HostingOperationSchema = z.object({
  id: z.uuid(),
  deploymentId: z.uuid(),
  nodeId: z.uuid(),
  kind: hostingOperationKindSchema,
  state: z.enum(['pending', 'running', 'succeeded', 'failed']),
  requestedBy: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  result: z.enum(['verified', 'execution_failed', 'lease_expired']).nullable(),
});
export const hostingOperationCompletionSchema = z
  .object({
    operationId: z.uuid(),
    success: z.boolean(),
  })
  .strict();
export const HostingOperationClaimSchema = z.object({
  operation: HostingOperationSchema.nullable(),
});
export const HostingOverviewSchema = z.object({
  instances: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      appCode: z.string(),
      customerEmail: z.string(),
      nodeId: z.uuid().nullable(),
      hostname: z.string().nullable(),
      state: z.string().nullable(),
      resources: hostingResourcesSchema.nullable(),
      services: z.array(hostingContainerSchema),
      backup: hostingBackupStatusSchema.nullable(),
      telemetryFresh: z.boolean(),
    }),
  ),
  operations: z.array(HostingOperationSchema),
});
export type HostingOperation = z.infer<typeof HostingOperationSchema>;
