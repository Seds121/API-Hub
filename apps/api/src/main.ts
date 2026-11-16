import 'reflect-metadata';
import { createApp } from './bootstrap';
import { env } from './config/env';
import { logger } from './common/logging/logger';

async function main() {
  const app = await createApp();
  await app.listen(env().PORT, '0.0.0.0');
  logger.info({ port: env().PORT }, `${env().COMPANY_NAME} API listening`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
