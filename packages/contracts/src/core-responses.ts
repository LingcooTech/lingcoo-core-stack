import { z } from 'zod';
export const roleSchema = z.enum(['user', 'support', 'finance', 'editor', 'operator', 'admin']);
export const userSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string().nullable(),
    role: roleSchema,
    emailVerified: z.boolean(),
  })
  .passthrough();
export const authResponseSchema = z
  .object({ token: z.string().min(1), user: userSchema })
  .passthrough();
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type CurrentUser = z.infer<typeof userSchema>;
export const browserAuthResponseSchema = z.object({
  user: userSchema,
  session: z.object({ id: z.uuid(), expiresAt: z.iso.datetime({ offset: true }) }),
  csrfToken: z.string().min(32),
});
export type BrowserAuthResponse = z.infer<typeof browserAuthResponseSchema>;
export const meResponseSchema = z
  .object({ authenticated: z.literal(true), user: userSchema })
  .passthrough();
export const errorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  })
  .passthrough();
export const jobDiagnosticSchema = z
  .object({
    id: z.uuid(),
    kind: z.string(),
    queue: z.string(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'dead']),
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    availableAt: z.iso.datetime({ offset: true }),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    startedAt: z.iso.datetime({ offset: true }).nullable(),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
    relatedEntityType: z.string().nullable(),
    relatedEntityId: z.string().nullable(),
    error: z.record(z.string(), z.unknown()),
  })
  .strict();
export const jobsResponseSchema = z
  .object({
    items: z.array(jobDiagnosticSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .passthrough();
export const entitlementSchema = z
  .object({ id: z.uuid(), userId: z.uuid(), appId: z.uuid(), planId: z.uuid(), status: z.string() })
  .passthrough();
export const entitlementsResponseSchema = z
  .object({ items: z.array(entitlementSchema) })
  .passthrough();
export const deploymentSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    appId: z.uuid(),
    entitlementId: z.uuid(),
    status: z.string(),
    label: z.string(),
  })
  .passthrough();
export const deploymentsResponseSchema = z
  .object({ items: z.array(deploymentSchema) })
  .passthrough();
export const orderSchema = z
  .object({
    id: z.uuid(),
    orderNo: z.string().min(8),
    userId: z.uuid(),
    amount: z.number().int().nonnegative(),
    currency: z.string(),
    status: z.string(),
  })
  .passthrough();
export const ordersResponseSchema = z.object({ items: z.array(orderSchema) }).passthrough();
export const checkoutResponseSchema = z
  .object({
    sessionId: z.uuid(),
    sessionCode: z.string().min(8),
    status: z.string(),
    order: orderSchema.omit({ userId: true }),
  })
  .passthrough();
