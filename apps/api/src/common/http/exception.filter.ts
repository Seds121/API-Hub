import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';
import { logger } from '../logging/logger';
import { redactString } from '../logging/redact';

/** Normalizes every error into { error: { code, message, details?, requestId } } and never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An internal error occurred.';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
      if (exception.headers)
        for (const [k, v] of Object.entries(exception.headers)) res.setHeader(k, v);
    } else if (exception instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_FAILED';
      message = 'Request validation failed.';
      details = exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'A record with these unique values already exists.';
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Resource not found.';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      code =
        status === 404
          ? 'NOT_FOUND'
          : status === 401
            ? 'UNAUTHENTICATED'
            : status === 403
              ? 'FORBIDDEN'
              : status === 413
                ? 'PAYLOAD_TOO_LARGE'
                : status === 429
                  ? 'RATE_LIMITED'
                  : status < 500
                    ? 'BAD_REQUEST'
                    : 'INTERNAL_ERROR';
      message =
        typeof r === 'string' ? r : ((r as { message?: string }).message?.toString() ?? message);
    } else if ((exception as { type?: string })?.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request payload too large.';
    } else if ((exception as { type?: string })?.type === 'entity.parse.failed') {
      status = 400;
      code = 'BAD_REQUEST';
      message = 'Malformed JSON body.';
    }

    if (status >= 500) {
      const err = exception as Error;
      logger.error(
        {
          requestId,
          path: req.path,
          err: {
            name: err?.name,
            message: redactString(String(err?.message ?? err)),
            stack: err?.stack,
          },
        },
        'unhandled error',
      );
    }
    if (!res.headersSent)
      res
        .status(status)
        .json({
          error: { code, message, ...(details !== undefined ? { details } : {}), requestId },
        });
  }
}
