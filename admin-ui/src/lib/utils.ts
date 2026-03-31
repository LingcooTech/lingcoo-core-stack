import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '永不过期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function formatAmount(amount: number, currency = 'CNY'): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(amount / 100);
}

export function getInitials(value: string | null | undefined): string {
  const source = String(value ?? 'FD').trim();
  if (!source) return 'FD';
  const cleaned = source
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!cleaned.length) return source.slice(0, 2).toUpperCase();
  return cleaned
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function truncate(str: string, max = 40): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
