import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './common/logging/logger';

/** Dedicated background-job process (no HTTP). Run one or more; jobs coordinate via Redis locks. */
async function main() {
  process.env.DISABLE_BACKGROUND_JOBS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  logger.info('worker started');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
