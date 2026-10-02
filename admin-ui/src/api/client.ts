import { createApiClient, ApiError, type ApiRequestOptions } from '@lingcoo/api-client';
import { isIdempotentCommand } from '@lingcoo/contracts';
const settingVersions = new Map<string, string>();
const settingVersionKey = (path: string) =>
  path.replace(/^(\/v1\/admin\/payment-settings)\/(wechat_pay|alipay)$/, '$1');
const TOKEN_KEY = 'fd_core_token';
const LEGACY_TOKEN_KEY = 'fd_core_admin_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  settingVersions.clear();
  pendingCommands.clear();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  settingVersions.clear();
  pendingCommands.clear();
}

export { ApiError, ProtocolError, NetworkError } from '@lingcoo/api-client';
const pendingCommands = new Map<string, string>();
const client = createApiClient({
  getToken,
  onUnauthorized: () => {
    clearToken();
    window.location.href = window.location.pathname.startsWith('/admin')
      ? '/admin/login'
      : '/login';
  },
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    const etag = response.headers.get('etag');
    if (etag && response.ok) settingVersions.set(settingVersionKey(String(input)), etag);
    return response;
  },
});
export async function apiClient<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const version = settingVersions.get(settingVersionKey(path));
  if (
    version &&
    options.method &&
    ['PUT', 'POST', 'DELETE', 'PATCH'].includes(options.method.toUpperCase())
  )
    headers.set('If-Match', version);
  let key = options.idempotencyKey;
  let fingerprint: string | undefined;
  if (!key && isIdempotentCommand(options.method ?? 'GET', path)) {
    fingerprint = `${getToken()}:${path}:${String(options.body ?? '')}`;
    key = pendingCommands.get(fingerprint) ?? crypto.randomUUID();
    pendingCommands.set(fingerprint, key);
  }
  try {
    const result = await client<T>(path, { ...options, headers, idempotencyKey: key });
    if (fingerprint) pendingCommands.delete(fingerprint);
    return result;
  } catch (error) {
    if (
      fingerprint &&
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 409
    )
      pendingCommands.delete(fingerprint);
    throw error;
  }
}
