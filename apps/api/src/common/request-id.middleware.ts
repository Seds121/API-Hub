import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './auth-context';

export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(incoming)
      ? incoming
      : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
