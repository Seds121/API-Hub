import { PrismaClient } from '@prisma/client';
import { seedDemo, seedPlatform, seedRbac } from './seed-lib';

async function main() {
  const prisma = new PrismaClient();
  const isProd = process.env.NODE_ENV === 'production';
  const company = process.env.COMPANY_NAME ?? 'Ze-Ze Technologies';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@zeze.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12)
    throw new Error('Set SEED_ADMIN_PASSWORD (≥12 chars) before seeding.');
  await seedRbac(prisma);
  const { user } = await seedPlatform(prisma, { adminEmail, adminPassword, companyName: company });
  console.warn(`✔ roles, permissions and platform admin (${adminEmail})`);
  if (isProd || process.env.SEED_DEMO === 'false') {
    console.warn('✔ production seed complete (no demo data)');
  } else {
    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass-2026';
    await seedDemo(prisma, {
      mockUrl: process.env.MOCK_UPSTREAM_URL ?? 'http://127.0.0.1:4010',
      demoPassword,
      adminUserId: user.id,
    });
    console.warn(
      `✔ DEMO data (development only): demo@acme.test / agency@northwind.test, password "${demoPassword}"`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
