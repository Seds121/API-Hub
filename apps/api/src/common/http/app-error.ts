import { ERROR_CODES, ErrorCode } from '@zeze/shared';

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? ERROR_CODES[code].message);
    this.status = ERROR_CODES[code].status;
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found.`);
export const forbidden = (msg?: string) => new AppError('FORBIDDEN', msg);
export const badRequest = (msg: string, details?: unknown) =>
  new AppError('BAD_REQUEST', msg, details);
export const conflict = (msg: string) => new AppError('CONFLICT', msg);
