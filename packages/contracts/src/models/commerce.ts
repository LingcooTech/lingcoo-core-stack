import { OrderItemsSchema } from '../order-items.js';
import { z } from 'zod';
import { UserSummarySchema, AppSummarySchema, PlanSummarySchema } from './summaries.js';
import { paginationSchema, AdminListParamsSchema } from './pagination.js';

export const CheckoutSessionSummarySchema = z.object({
  id: z.uuid(),
  sessionCode: z.string(),
  status: z.string(),
  provider: z.union([z.string(), z.null()]),
  actionType: z.union([z.string(), z.null()]),
  actionPayload: z.unknown(),
  successUrl: z.union([z.string(), z.null()]),
  cancelUrl: z.union([z.string(), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type CheckoutSessionSummary = z.infer<typeof CheckoutSessionSummarySchema>;

export const OrderSchema = z.object({
  items: OrderItemsSchema.optional(),
  id: z.uuid(),
  orderNo: z.string(),
  status: z.string(),
  provider: z.union([z.string(), z.null()]),
  providerOrderId: z.union([z.string(), z.null()]),
  amount: z.number(),
  currency: z.string(),
  paidAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  userId: z.string(),
  appId: z.string(),
  planId: z.string(),
});

export type Order = z.infer<typeof OrderSchema>;

export const HydratedOrderSchema = z.intersection(
  OrderSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
    plan: z.union([PlanSummarySchema, z.null()]),
    checkoutSession: z.union([CheckoutSessionSummarySchema, z.null()]),
  }),
);

export type HydratedOrder = z.infer<typeof HydratedOrderSchema>;

export const PaymentAttemptSchema = z.object({
  id: z.uuid(),
  attemptNo: z.number().int().positive(),
  status: z.string(),
  actionType: z.union([z.string(), z.null()]),
  providerReference: z.union([z.string(), z.null()]),
  requestPayload: z.unknown(),
  responsePayload: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type PaymentAttempt = z.infer<typeof PaymentAttemptSchema>;

export const EntitlementSummarySchema = z.object({
  id: z.uuid(),
  status: z.string(),
  startsAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  plan: z.union([PlanSummarySchema, z.null()]),
});

export type EntitlementSummary = z.infer<typeof EntitlementSummarySchema>;

export const OrderEventSummarySchema = z.object({
  eventName: z.string(),
  eventTime: z.iso.datetime({ offset: true }),
  properties: z.unknown(),
});

export type OrderEventSummary = z.infer<typeof OrderEventSummarySchema>;

export const OrderDetailSchema = z.object({
  item: HydratedOrderSchema,
  paymentAttempts: z.array(PaymentAttemptSchema),
  entitlements: z.array(EntitlementSummarySchema),
  events: z.array(OrderEventSummarySchema),
});

export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const OrdersResponseSchema = paginationSchema(HydratedOrderSchema);

export type OrdersResponse = z.infer<typeof OrdersResponseSchema>;

export const OrderAdminActionResultSchema = z.object({
  changed: z.boolean(),
  order: OrderSchema,
  action: z.object({
    status: z.union([
      z.literal('cancelled'),
      z.literal('paid'),
      z.literal('refunding'),
      z.literal('refunded'),
    ]),
    reason: z.string(),
    refundId: z.union([z.string(), z.null()]).optional(),
  }),
});

export type OrderAdminActionResult = z.infer<typeof OrderAdminActionResultSchema>;

export const CheckoutSessionCreatedSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  status: z.string(),
  app: AppSummarySchema.omit({ id: true }),
  product: z.object({ code: z.string(), name: z.string() }),
  plan: z.object({
    code: z.string(),
    name: z.string(),
    interval: z.union([z.string(), z.null()]),
    priceAmount: z.number(),
    currency: z.string(),
  }),
  order: z.object({
    items: OrderItemsSchema.optional(),
    id: z.uuid(),
    orderNo: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
  }),
  presentation: z.object({ type: z.literal('hosted_page'), url: z.string() }),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type CheckoutSessionCreated = z.infer<typeof CheckoutSessionCreatedSchema>;

export const CheckoutSessionPublicSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  status: z.string(),
  app: AppSummarySchema.omit({ id: true }),
  product: z.object({ code: z.string(), name: z.string() }),
  plan: z.object({ code: z.string(), name: z.string(), interval: z.union([z.string(), z.null()]) }),
  order: z.object({
    items: OrderItemsSchema.optional(),
    orderNo: z.string(),
    subject: z.string(),
    amount: z.number(),
    amountYuan: z.string(),
    currency: z.string(),
  }),
  paymentAction: z.union([
    z.object({
      type: z.literal('qr_code'),
      qrCodeText: z.string(),
      codeUrl: z.string(),
      qrCodeDataUrl: z.string(),
    }),
    z.object({ type: z.literal('redirect_url'), url: z.string() }),
    z.null(),
  ]),
  successUrl: z.union([z.string(), z.null()]),
  cancelUrl: z.union([z.string(), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});

export type CheckoutSessionPublic = z.infer<typeof CheckoutSessionPublicSchema>;

export const CheckoutSessionStatusSchema = z.object({
  sessionCode: z.string(),
  status: z.string(),
  orderNo: z.string(),
  paidAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});

export type CheckoutSessionStatus = z.infer<typeof CheckoutSessionStatusSchema>;

export const ReconcileResponseSchema = z.object({
  sessionCode: z.string().optional(),
  status: z.string().optional(),
  orderNo: z.string().optional(),
  paidAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  changed: z.boolean().optional(),
  reconciliation: z.object({ status: z.string(), reason: z.string() }),
});

export type ReconcileResponse = z.infer<typeof ReconcileResponseSchema>;

export const EntitlementSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  sourceType: z.string(),
  sourceId: z.union([z.string(), z.null()]),
  startsAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  meta: z.record(z.string(), z.unknown()).optional(),
  userId: z.string(),
  appId: z.string(),
  planId: z.string(),
});

export type Entitlement = z.infer<typeof EntitlementSchema>;

export const HydratedEntitlementSchema = z.intersection(
  EntitlementSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
    plan: z.union([PlanSummarySchema, z.null()]),
    sourceOrder: z.union([
      z.object({ id: z.string(), orderNo: z.string(), status: z.string() }),
      z.null(),
    ]),
  }),
);

export type HydratedEntitlement = z.infer<typeof HydratedEntitlementSchema>;

export const EntitlementsResponseSchema = z.intersection(
  paginationSchema(HydratedEntitlementSchema),
  z.object({
    summary: z
      .array(z.object({ appCode: z.string(), featureCodes: z.array(z.string()) }))
      .optional(),
  }),
);

export type EntitlementsResponse = z.infer<typeof EntitlementsResponseSchema>;

export const GrantEntitlementInputSchema = z.object({
  userEmail: z.string(),
  planCode: z.string(),
  reason: z.string().optional(),
});

export type GrantEntitlementInput = z.infer<typeof GrantEntitlementInputSchema>;

export const GrantEntitlementResultSchema = z.object({
  user: UserSummarySchema,
  plan: PlanSummarySchema,
  app: AppSummarySchema,
  granted: z.boolean(),
  reason: z.string(),
  sourceId: z.string(),
});

export type GrantEntitlementResult = z.infer<typeof GrantEntitlementResultSchema>;

export const RevokeEntitlementResultSchema = z.object({
  entitlementId: z.string(),
  sourceType: z.string(),
  sourceId: z.union([z.string(), z.null()]),
  revokedCount: z.number(),
  userId: z.string(),
  appId: z.string(),
});

export type RevokeEntitlementResult = z.infer<typeof RevokeEntitlementResultSchema>;

export const BillingWebhookEventSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  type: z.string(),
  providerEventId: z.string(),
  status: z.string(),
  payload: z.unknown(),
  processedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type BillingWebhookEvent = z.infer<typeof BillingWebhookEventSchema>;

export const WebhooksResponseSchema = paginationSchema(BillingWebhookEventSchema);

export type WebhooksResponse = z.infer<typeof WebhooksResponseSchema>;

export const PlanSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  interval: z.union([z.string(), z.null()]),
  appId: z.string(),
});

export type Plan = z.infer<typeof PlanSchema>;

export const PlansResponseSchema = z.object({ items: z.array(PlanSchema) });

export type PlansResponse = z.infer<typeof PlansResponseSchema>;

export const AdminOrderListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z
      .union([
        z.literal('pending'),
        z.literal('paid'),
        z.literal('failed'),
        z.literal('cancelled'),
        z.literal('refunding'),
        z.literal('refunded'),
      ])
      .optional(),
    provider: z.union([z.literal('wechat_pay'), z.literal('alipay')]).optional(),
  }),
);

export type AdminOrderListParams = z.infer<typeof AdminOrderListParamsSchema>;

export const MyOrdersResponseSchema = z.object({
  items: z.array(
    OrderSchema.extend({
      user: UserSummarySchema.nullable().optional(),
      app: AppSummarySchema.nullable().optional(),
      plan: PlanSummarySchema.nullable().optional(),
      checkoutSession: CheckoutSessionSummarySchema.nullable().optional(),
    }),
  ),
});

export type MyOrdersResponse = z.infer<typeof MyOrdersResponseSchema>;

export const MyEntitlementsResponseSchema = z.object({
  items: z.array(
    EntitlementSchema.extend({
      app: AppSummarySchema.nullable(),
      plan: PlanSummarySchema.nullable(),
      featureCodes: z.array(z.string()),
      sourceOrder: z
        .object({ id: z.string(), orderNo: z.string(), status: z.string() })
        .nullable()
        .optional(),
    }),
  ),
  summary: z.array(z.object({ appCode: z.string(), featureCodes: z.array(z.string()) })),
});

export type MyEntitlementsResponse = z.infer<typeof MyEntitlementsResponseSchema>;

export type MyOrder = MyOrdersResponse['items'][number];

export type MyEntitlement = MyEntitlementsResponse['items'][number];
