import type { ApiErrorCode } from '@bingo/shared';

/**
 * Every failure that reaches a client goes through AppError, so responses
 * always carry a stable machine-readable code and never leak internals.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly fields: Record<string, string[]> | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }

  static validation(message: string, fields?: Record<string, string[]>): AppError {
    return new AppError('validation_error', message, 400, fields);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('unauthorized', message, 401);
  }

  static invalidCredentials(): AppError {
    return new AppError('invalid_credentials', 'Email or password is incorrect', 401);
  }

  static sessionExpired(message = 'Session expired'): AppError {
    return new AppError('session_expired', message, 401);
  }

  static forbidden(message = 'Not allowed'): AppError {
    return new AppError('forbidden', message, 403);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError('not_found', message, 404);
  }

  static conflict(code: ApiErrorCode, message: string): AppError {
    return new AppError(code, message, 409);
  }

  static insufficientFunds(message = 'Not enough credits'): AppError {
    return new AppError('insufficient_funds', message, 409);
  }

  static internal(message = 'Unexpected error'): AppError {
    return new AppError('internal_error', message, 500);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
