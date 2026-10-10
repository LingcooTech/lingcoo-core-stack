export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

// Maps common status strings to tones
export function statusToTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (['active', 'paid', 'completed', 'ok', 'success', 'configured', 'granted'].includes(s))
    return 'ok';
  if (['pending', 'processing', 'refunding', 'partial'].includes(s)) return 'warn';
  if (['failed', 'cancelled', 'expired', 'revoked', 'inactive', 'error'].includes(s))
    return 'danger';
  if (['env', 'database'].includes(s)) return 'info';
  return 'neutral';
}
