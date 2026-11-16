import pino from 'pino';
import { PINO_REDACT_PATHS } from './redact';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: { paths: PINO_REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'zeze-api' },
});
