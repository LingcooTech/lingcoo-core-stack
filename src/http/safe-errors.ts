import { ZodError } from 'zod';

export function safeErrorResponse(error: unknown, requestId: string) {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'ValidationError',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.flatten(),
        requestId,
      },
    };
  }
  const known =
    error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number';
  const candidate = known ? error.statusCode : 500;
  const status =
    typeof candidate === 'number' && candidate >= 400 && candidate <= 599 ? candidate : 500;
  const publicError = known && status < 500;
  return {
    status,
    body: {
      error: publicError ? error.name : 'InternalServerError',
      code:
        publicError && 'code' in error && typeof error.code === 'string'
          ? error.code
          : status >= 500
            ? 'INTERNAL_ERROR'
            : `HTTP_${status}`,
      message: publicError ? error.message : 'Unexpected server error',
      ...(publicError && 'details' in error && error.details !== undefined
        ? { details: error.details }
        : {}),
      requestId,
    },
  };
}
