import { createApiClient, ApiError, type EndpointRequestOptions } from '@lingcoo/api-client';
import {
  isIdempotentCommand,
  endpointContract,
  type EndpointId,
  type EndpointResponse,
} from '@lingcoo/contracts';
const settingVersions = new Map<string, string>();
const settingVersionKey = (path: string) =>
  path.replace(/^(\/v1\/admin\/payment-settings)\/(wechat|wechat_pay|alipay)$/, '$1');
export function clearToken(): void {
  localStorage.removeItem('fd_core_token');
  localStorage.removeItem('fd_core_admin_token');
  settingVersions.clear();
  pendingCommands.clear();
}
export function getCsrfToken(): string {
  const raw = document.cookie.split('; ').find((entry) => entry.startsWith('fd_core_csrf='));
  return raw ? decodeURIComponent(raw.slice('fd_core_csrf='.length)) : '';
}
export { ApiError, ProtocolError, NetworkError } from '@lingcoo/api-client';
const pendingCommands = new Map<string, string>();
const client = createApiClient({
  credentials: 'include',
  getCsrfToken,
  onUnauthorized: (path, credentialContext) => {
    if (getCsrfToken() !== credentialContext) return;
    if (path === '/v1/auth/session/login' || path === '/v1/auth/session/register') return;
    clearToken();
    window.dispatchEvent(new Event('stack:session-expired'));
  },
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    const etag = response.headers.get('etag');
    if (etag && response.ok) settingVersions.set(settingVersionKey(String(input)), etag);
    return response;
  },
});
export async function apiClient<Id extends EndpointId>(
  id: Id,
  path: string,
  options: EndpointRequestOptions = {},
): Promise<EndpointResponse<Id>> {
  const { method } = endpointContract(id, path);
  const headers = new Headers(options.headers);
  const version = settingVersions.get(settingVersionKey(path));
  if (version && ['PUT', 'POST', 'DELETE', 'PATCH'].includes(method))
    headers.set('If-Match', version);
  let key = options.idempotencyKey;
  let fingerprint: string | undefined;
  if (!key && isIdempotentCommand(method, path)) {
    fingerprint = `${getCsrfToken()}:${path}:${String(options.body ?? '')}`;
    key = pendingCommands.get(fingerprint) ?? crypto.randomUUID();
    pendingCommands.set(fingerprint, key);
  }
  try {
    const result = await client.endpoint(id, path, { ...options, headers, idempotencyKey: key });
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
