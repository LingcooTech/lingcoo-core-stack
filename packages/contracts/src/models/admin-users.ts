import { z } from 'zod';
import { HydratedOrderSchema, HydratedEntitlementSchema } from './commerce.js';
import { HydratedInstallSchema } from './install.js';
import { AuditLogSchema } from './audit.js';
import { EventSchema } from './event.js';
import { HydratedSupportTicketSchema } from './ticket.js';
import { AdminUserSchema } from './auth.js';

export const AdminUserActivitySchema = z.object({
  summary: z.object({
    recentOrders: z.number(),
    activeEntitlements: z.number(),
    installs: z.number(),
    auditLogs: z.number(),
    events: z.number(),
    tickets: z.number(),
  }),
  orders: z.array(HydratedOrderSchema),
  entitlements: z.array(HydratedEntitlementSchema),
  installs: z.array(HydratedInstallSchema),
  auditLogs: z.array(AuditLogSchema),
  events: z.array(EventSchema),
  tickets: z.array(HydratedSupportTicketSchema),
});

export type AdminUserActivity = z.infer<typeof AdminUserActivitySchema>;

export const AdminUserDetailSchema = z.intersection(
  AdminUserSchema,
  z.object({
    emailVerifiedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    activity: AdminUserActivitySchema,
  }),
);

export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;
