import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env, isProd } from './config/env';
import { requestIdMiddleware } from './common/request-id.middleware';
import type { AppRequest } from './common/auth-context';

/** Shared app factory used by main.ts and the e2e test-suite. */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: opts.logger === false ? false : ['error', 'warn', 'log'],
  });
  app.set('trust proxy', e.TRUST_PROXY === 'true' ? true : Number(e.TRUST_PROXY) || 0);
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      hsts: isProd() ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  if (isProd()) {
    // HTTPS enforcement behind a TLS-terminating proxy (nginx/ALB).
    app.use((req: AppRequest, res: express.Response, next: express.NextFunction) => {
      if (req.secure || req.path.startsWith('/api/health')) return next();
      res.status(400).json({ error: { code: 'HTTPS_REQUIRED', message: 'HTTPS is required.' } });
    });
  }
  app.use(cookieParser());
  // Raw body is kept for webhook signature verification.
  const rawSaver = (req: AppRequest, _res: unknown, buf: Buffer) => {
    if (req.path.startsWith('/api/webhooks/')) req.rawBody = Buffer.from(buf);
  };
  app.use('/v1', express.json({ limit: e.GATEWAY_MAX_BODY_BYTES, verify: rawSaver as never }));
  app.use(express.json({ limit: '256kb', verify: rawSaver as never }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.enableCors({
    origin: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: true,
    allowedHeaders: [
      'content-type',
      'x-csrf-token',
      'x-org-id',
      'authorization',
      'x-api-key',
      'idempotency-key',
      'x-request-id',
    ],
    exposedHeaders: [
      'x-request-id',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'retry-after',
      'x-zz-cost',
    ],
  });

  const doc = new DocumentBuilder()
    .setTitle(`${e.COMPANY_NAME} — Platform API`)
    .setDescription(
      'Management API for the web application. Customer API traffic uses the gateway under /v1 with API keys.',
    )
    .setVersion('1.0')
    .addCookieAuth('zz_session')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc), {
    jsonDocumentUrl: 'api/docs-json',
  });
  app.enableShutdownHooks();
  return app;
}
