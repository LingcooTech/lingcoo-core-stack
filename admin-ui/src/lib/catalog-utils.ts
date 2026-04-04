export function formatPriceYuan(priceAmount?: number) {
  return ((priceAmount ?? 0) / 100).toFixed(2);
}

export function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}
