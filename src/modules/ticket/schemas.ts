import { z } from 'zod';

export const supportTicketCategorySchema = z.enum([
  'account',
  'billing',
  'access',
  'install',
  'deployment',
  'bug',
  'feature',
  'other'
]);

export const supportTicketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const supportTicketStatusSchema = z.enum(['waiting_staff', 'waiting_user', 'resolved', 'closed']);

export const supportTicketListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(255).optional(),
  status: supportTicketStatusSchema.optional(),
  category: supportTicketCategorySchema.optional(),
  priority: supportTicketPrioritySchema.optional()
});

export const supportTicketNoParamsSchema = z.object({
  ticketNo: z.string().trim().min(6).max(64)
});

export const createSupportTicketSchema = z.object({
  appCode: z.string().trim().min(1).max(64).optional(),
  orderNo: z.string().trim().min(6).max(64).optional(),
  extensionInstallId: z.string().trim().min(1).max(128).optional(),
  deploymentId: z.string().uuid().optional(),
  category: supportTicketCategorySchema.default('other'),
  priority: supportTicketPrioritySchema.default('normal'),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000)
});

export const supportTicketReplySchema = z.object({
  body: z.string().trim().min(1).max(5000)
});

export const adminSupportTicketReplySchema = supportTicketReplySchema.extend({
  isInternal: z.boolean().optional().default(false)
});

export const adminAssignSupportTicketSchema = z.object({
  assignedAdminUserId: z.string().uuid().nullable()
});

export const adminUpdateSupportTicketStatusSchema = z.object({
  status: supportTicketStatusSchema
});
