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
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  if (
    cause instanceof Error &&
    'code' in cause &&
    cause.code === '23514' &&
    cause.message === 'Referenced storage asset must be active and public'
  )
    return {
      status: 409,
      body: {
        error: 'Conflict',
        code: 'STORAGE_REFERENCE_UNAVAILABLE',
        message: '引用的素材已删除或不是公开素材，请重新选择',
        requestId,
      },
    };
  if (
    cause instanceof Error &&
    'code' in cause &&
    cause.code === '23505' &&
    'constraint' in cause &&
    cause.constraint === 'storage_folders_name_uidx'
  )
    return {
      status: 409,
      body: {
        error: 'Conflict',
        code: 'STORAGE_FOLDER_EXISTS',
        message: '该文件夹名称已存在',
        requestId,
      },
    };
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
