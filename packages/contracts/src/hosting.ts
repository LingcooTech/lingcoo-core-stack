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
    resources: hostingResourcesSchema,
  })
  .strict();
export const createHostingNodeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    serverIp: serverIpSchema,
    capacity: hostingResourcesSchema,
  })
  .strict();
export const hostingNodeReportSchema = z
  .object({
    dockerReady: z.boolean(),
    available: hostingResourcesSchema.extend({
      cpuMillis: z.number().int().min(0).max(128000),
      memoryMb: z.number().int().min(0).max(1048576),
      diskMb: z.number().int().min(0).max(104857600),
    }),
  })
  .strict();
export const hostingNodeStateSchema = z.object({ enabled: z.boolean() }).strict();
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
