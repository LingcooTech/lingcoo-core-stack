import { z } from 'zod';
import { UserSummarySchema, AppSummarySchema } from './summaries.js';
import { paginationSchema, AdminListParamsSchema } from './pagination.js';

export const SupportTicketRelatedOrderSchema = z.object({
  id: z.uuid(),
  orderNo: z.string(),
  status: z.string(),
  subject: z.string(),
  amount: z.number(),
  currency: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type SupportTicketRelatedOrder = z.infer<typeof SupportTicketRelatedOrderSchema>;

export const SupportTicketRelatedInstallSchema = z.object({
  id: z.uuid(),
  extensionInstallId: z.string(),
  status: z.string(),
  appVersion: z.union([z.string(), z.null()]),
  lastSeenAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});

export type SupportTicketRelatedInstall = z.infer<typeof SupportTicketRelatedInstallSchema>;

export const SupportTicketRelatedDeploymentSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  environment: z.string(),
  status: z.string(),
  domainValues: z.record(z.string(), z.string()),
});

export type SupportTicketRelatedDeployment = z.infer<typeof SupportTicketRelatedDeploymentSchema>;

export const SupportTicketSchema = z.object({
  id: z.uuid(),
  ticketNo: z.string(),
  userId: z.string(),
  appId: z.union([z.string(), z.null()]),
  orderId: z.union([z.string(), z.null()]),
  installId: z.union([z.string(), z.null()]),
  deploymentId: z.union([z.string(), z.null()]),
  category: z.union([
    z.literal('account'),
    z.literal('billing'),
    z.literal('access'),
    z.literal('install'),
    z.literal('deployment'),
    z.literal('bug'),
    z.literal('feature'),
    z.literal('other'),
  ]),
  priority: z.union([
    z.literal('low'),
    z.literal('normal'),
    z.literal('high'),
    z.literal('urgent'),
  ]),
  status: z.union([
    z.literal('waiting_staff'),
    z.literal('waiting_user'),
    z.literal('resolved'),
    z.literal('closed'),
  ]),
  subject: z.string(),
  assignedAdminUserId: z.union([z.string(), z.null()]),
  lastReplyAuthorType: z.union([z.literal('user'), z.literal('admin'), z.literal('system')]),
  lastActivityAt: z.iso.datetime({ offset: true }),
  firstRespondedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  resolvedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  closedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type SupportTicket = z.infer<typeof SupportTicketSchema>;

export const HydratedSupportTicketSchema = z.intersection(
  SupportTicketSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
    order: z.union([SupportTicketRelatedOrderSchema, z.null()]),
    install: z.union([SupportTicketRelatedInstallSchema, z.null()]),
    deployment: z.union([SupportTicketRelatedDeploymentSchema, z.null()]),
    assignee: z.union([UserSummarySchema, z.null()]),
    messageCount: z.number(),
  }),
);

export type HydratedSupportTicket = z.infer<typeof HydratedSupportTicketSchema>;

export const SupportTicketMessageSchema = z.object({
  id: z.uuid(),
  ticketId: z.string(),
  authorUserId: z.union([z.string(), z.null()]),
  authorType: z.union([z.literal('user'), z.literal('admin'), z.literal('system')]),
  isInternal: z.boolean(),
  body: z.string(),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  author: z.union([UserSummarySchema, z.null()]),
});

export type SupportTicketMessage = z.infer<typeof SupportTicketMessageSchema>;

export const SupportTicketDetailSchema = z.object({
  ticket: HydratedSupportTicketSchema,
  messages: z.array(SupportTicketMessageSchema),
});

export type SupportTicketDetail = z.infer<typeof SupportTicketDetailSchema>;

export const SupportTicketsResponseSchema = paginationSchema(HydratedSupportTicketSchema);

export type SupportTicketsResponse = z.infer<typeof SupportTicketsResponseSchema>;

export const AdminTicketListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z
      .union([
        z.literal('waiting_staff'),
        z.literal('waiting_user'),
        z.literal('resolved'),
        z.literal('closed'),
      ])
      .optional(),
    category: z
      .union([
        z.literal('account'),
        z.literal('billing'),
        z.literal('access'),
        z.literal('install'),
        z.literal('deployment'),
        z.literal('bug'),
        z.literal('feature'),
        z.literal('other'),
      ])
      .optional(),
    priority: z
      .union([z.literal('low'), z.literal('normal'), z.literal('high'), z.literal('urgent')])
      .optional(),
  }),
);

export type AdminTicketListParams = z.infer<typeof AdminTicketListParamsSchema>;
