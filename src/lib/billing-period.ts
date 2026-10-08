/** Calendar-based billing anchored in UTC, independent of the host timezone.
 * Calculate each renewal from the original anchor to avoid Jan 31 -> Feb 28 -> Mar 28 drift.
 */
export function billingPeriodEnd(anchor: Date, interval: 'month' | 'year', periods = 1): Date {
  if (
    !Number.isFinite(anchor.getTime()) ||
    !Number.isSafeInteger(periods) ||
    periods < 1 ||
    periods > 1200
  )
    throw new RangeError('Invalid billing period');
  const month = anchor.getUTCMonth() + periods * (interval === 'year' ? 12 : 1);
  const next = new Date(anchor);
  next.setUTCDate(1);
  next.setUTCMonth(month);
  const last = new Date(next);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(anchor.getUTCDate(), last.getUTCDate()));
  return next;
}
