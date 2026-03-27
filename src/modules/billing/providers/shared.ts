import fs from 'node:fs';
import path from 'node:path';

import { httpError } from '../../../lib/errors';

const secretFileCache = new Map<string, string>();

function resolvePath(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

export function readSecretFile(filePath: string | undefined, label: string) {
  if (!filePath) {
    throw httpError(422, `${label} is not configured`);
  }

  const absolutePath = resolvePath(filePath);
  const cached = secretFileCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    secretFileCache.set(absolutePath, content);
    return content;
  } catch {
    throw httpError(500, `Failed to read ${label} from ${absolutePath}`);
  }
}

export function readSecretValue(input: {
  inlineValue?: string;
  filePath?: string;
  label: string;
}) {
  if (input.inlineValue?.trim()) {
    return input.inlineValue.trim();
  }

  return readSecretFile(input.filePath, input.label);
}

export function resolveCallbackUrl(explicitUrl: string | undefined, publicBaseUrl: string, pathname: string) {
  if (explicitUrl?.trim()) {
    return explicitUrl.trim();
  }

  return new URL(pathname, publicBaseUrl).toString();
}

export function amountFenToYuanString(amount: number) {
  if (!Number.isInteger(amount)) {
    throw httpError(500, 'Amount must be stored as integer cents');
  }

  return (amount / 100).toFixed(2);
}

export function amountYuanStringToFen(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw httpError(400, `Invalid amount value: ${value}`);
  }

  const [integerPart, decimalPart = ''] = normalized.split('.');
  return Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
}

export function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function getHeaderValue(headers: Record<string, unknown>, key: string) {
  const headerValue = headers[key.toLowerCase()] ?? headers[key];

  if (Array.isArray(headerValue)) {
    return typeof headerValue[0] === 'string' ? headerValue[0] : '';
  }

  return typeof headerValue === 'string' ? headerValue : '';
}

export function parseRawFormBody(rawBody: string) {
  const result: Record<string, string> = {};

  for (const pair of rawBody.split('&')) {
    if (!pair) {
      continue;
    }

    const separatorIndex = pair.indexOf('=');
    const key = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

export function normalizeFormBody(body: unknown) {
  const result: Record<string, string> = {};
  const record = normalizeObject(body);

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      const [first] = value;
      if (first !== undefined && first !== null) {
        result[key] = String(first);
      }
      continue;
    }

    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }

  return result;
}
