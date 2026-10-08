import { z } from 'zod';
import { paginationSchema } from './models/pagination.js';
export const adminDeploymentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  search: z.string().trim().max(200).default(''),
  mode: z.enum(['all', 'self_hosted', 'managed']).default('all'),
  status: z.enum(['all', 'active', 'inactive', 'cancelled', 'expired']).default('all'),
});
export const AdminDeploymentSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  userId: z.uuid(),
  customerEmail: z.string(),
  appCode: z.string(),
  appName: z.string(),
  mode: z.enum(['self_hosted', 'managed']),
  status: z.string(),
  hostingState: z.string().nullable(),
  serverHost: z.string().nullable(),
  nodeName: z.string().nullable(),
  entitlementId: z.uuid().nullable(),
  entitlementStatus: z.string().nullable(),
  entitlementExpiresAt: z.string().nullable(),
  domains: z.array(z.string()),
  createdAt: z.string(),
  lastDeployedAt: z.string().nullable(),
  lastReportedAt: z.string().nullable(),
});
export const AdminDeploymentsSchema = paginationSchema(AdminDeploymentSchema);
export type AdminDeployment = z.infer<typeof AdminDeploymentSchema>;
