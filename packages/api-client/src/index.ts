import {
  responseSchemaFor,
  errorResponseSchema,
  endpointContract,
  type EndpointId,
  type EndpointResponse,
} from '@lingcoo/contracts';
import type { z } from 'zod';
export class ApiError<TDetails = unknown> extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: TDetails,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export class ProtocolError extends Error {
  constructor(
    public readonly path: string,
    public readonly requestId?: string,
  ) {
    super('Server response does not match the API contract');
    this.name = 'ProtocolError';
  }
}
export class NetworkError extends Error {
  constructor() {
    super('Unable to reach the server');
    this.name = 'NetworkError';
  }
}
export type ApiRequestOptions = RequestInit & { schema?: z.ZodType; idempotencyKey?: string };
export type EndpointRequestOptions = Omit<ApiRequestOptions, 'method' | 'schema'>;
export function createApiClient(
  config: {
    baseUrl?: string;
    fetch?: typeof fetch;
    getToken?: () => string;
    getCsrfToken?: () => string;
    credentials?: RequestCredentials;
    onUnauthorized?: (path: string, credentialContext: string) => void;
  } = {},
) {
  function request<S extends z.ZodType>(
    path: string,
    options: ApiRequestOptions & { schema: S },
  ): Promise<z.output<S>>;
  function request(path: string, options?: ApiRequestOptions): Promise<unknown>;
  async function request(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
    const { schema, idempotencyKey, ...init } = options;
    const headers = new Headers(init.headers);
    const token = config.getToken?.();
    if (token) headers.set('authorization', `Bearer ${token}`);
    const csrf = config.getCsrfToken?.();
    if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase()))
      headers.set('x-csrf-token', csrf);
    if (typeof init.body === 'string' && !headers.has('content-type'))
      headers.set('content-type', 'application/json');
    if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
    let response: Response;
    try {
      response = await (config.fetch ?? fetch)(`${config.baseUrl ?? ''}${path}`, {
        ...init,
        credentials: init.credentials ?? config.credentials,
        headers,
      });
    } catch (error) {
      if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
        throw error;
      throw new NetworkError();
    }
    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (response.status === 401) config.onUnauthorized?.(path, csrf ?? token ?? '');
    if (response.status === 204) {
      const contract = schema ?? responseSchemaFor((init.method ?? 'GET').toUpperCase(), path);
      if (!contract?.safeParse(undefined).success) throw new ProtocolError(path, requestId);
      return undefined;
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ProtocolError(path, requestId);
    }
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(data);
      if (!parsed.success) throw new ProtocolError(path, requestId);
      throw new ApiError(
        parsed.data.message,
        response.status,
        parsed.data.details,
        parsed.data.code,
        parsed.data.requestId ?? requestId,
      );
    }
    const contract = schema ?? responseSchemaFor((init.method ?? 'GET').toUpperCase(), path);
    const parsed = contract?.safeParse(data);
    if (!parsed?.success) throw new ProtocolError(path, requestId);
    return parsed.data;
  }
  async function endpoint<Id extends EndpointId>(
    id: Id,
    path: string,
    options: EndpointRequestOptions = {},
  ): Promise<EndpointResponse<Id>> {
    const contract = endpointContract(id, path);
    // The registry selects both the runtime parser and the inferred response for this ID.
    return (await request(path, {
      ...options,
      method: contract.method,
      schema: contract.schema,
    })) as EndpointResponse<Id>;
  }
  return Object.assign(request, { endpoint });
}
