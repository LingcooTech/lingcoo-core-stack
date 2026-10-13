/** Free acquisition is an explicit product mode, not a zero-price paid checkout. */
export function freeAcquisitionPlan<
  T extends {
    id: string;
    status: string;
    priceAmount: number;
    currency: string;
    interval: string;
    meta: unknown;
  },
>(
  plans: T[],
  features: { id: string; status: string }[],
  mappings: { planId: string; featureId: string }[],
) {
  const candidates = plans.filter(
    (p) =>
      p.status === 'active' &&
      p.priceAmount === 0 &&
      p.currency === 'CNY' &&
      p.interval === 'one_time',
  );
  if (candidates.length !== 1) return undefined;
  const plan = candidates[0]!;
  if ((plan.meta as Record<string, unknown> | null)?.acceptanceOnlyPrice) return undefined;
  const linked = mappings.filter((m) => m.planId === plan.id);
  return linked.length > 0 &&
    linked.every((m) => features.some((f) => f.id === m.featureId && f.status === 'active'))
    ? plan
    : undefined;
}
