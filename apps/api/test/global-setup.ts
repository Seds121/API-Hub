import { execSync } from 'child_process';
import path from 'path';
import Redis from 'ioredis';
import './env';
import { createMockUpstream } from './mock-upstream/server';

export default async function globalSetup() {
  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env };
  // Fresh schema for every run (test database only).
  if (!/zeze_test/.test(env.DATABASE_URL!))
    throw new Error('Refusing to reset a non-test database');
  execSync(
    `psql "${env.DATABASE_URL!.split('?')[0]}" -q -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`,
    { cwd, env, stdio: 'pipe' },
  );
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  const redis = new Redis(env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
  const { server } = createMockUpstream();
  await new Promise<void>((r) => server.listen(4011, '127.0.0.1', () => r()));
  (globalThis as { __MOCK__?: unknown }).__MOCK__ = server;
  const { PrismaClient } = await import('@prisma/client');
  const { seedRbac, seedPlatform, seedDemo } = await import('../src/seed/seed-lib');
  const prisma = new PrismaClient();
  await seedRbac(prisma);
  const { user } = await seedPlatform(prisma, {
    adminEmail: 'admin@test.local',
    adminPassword: 'Admin-Password-123',
    companyName: 'Ze-Ze Technologies',
  });
  await seedDemo(prisma, {
    mockUrl: process.env.MOCK_UPSTREAM_URL!,
    demoPassword: 'DemoPass-2026',
    adminUserId: user.id,
  });
  await prisma.$disconnect();
}
