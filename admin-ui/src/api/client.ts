const TOKEN_KEY = 'fd_core_token';
const LEGACY_TOKEN_KEY = 'fd_core_admin_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export class ApiError<TDetails = unknown> extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: TDetails
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiClient<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>)
  };

  if (typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    window.location.href = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    throw new ApiError('未授权，请重新登录', 401);
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    let details: unknown;
    try {
      const data = await response.json() as { message?: string; error?: string; details?: unknown };
      message = data.message ?? data.error ?? message;
      details = data.details;
    } catch {
      // ignore parse error
    }
    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
