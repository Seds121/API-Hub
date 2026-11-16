/* Seed entry point — compiled to dist/cli/seed.js so it runs inside the production image.
 * Always: roles, permissions, platform org, first admin.
 * Demo catalog only when NODE_ENV !== 'production' or DEMO_MODE=true (and SEED_DEMO !== 'false'). */
import { PrismaClient } from '@prisma/client';
import { seedDemo, seedPlatform, seedRbac } from '../seed/seed-lib';

export async function runSeed() {
  const prisma = new PrismaClient();
  const isProd = process.env.NODE_ENV === 'production';
  const demoMode = ['true', '1'].includes(String(process.env.DEMO_MODE));
  const company = process.env.COMPANY_NAME ?? 'Ze-Ze Technologies';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@zeze.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12)
    throw new Error('Set SEED_ADMIN_PASSWORD (≥12 chars) before seeding.');
  try {
    await seedRbac(prisma);
    const { user } = await seedPlatform(prisma, {
      adminEmail,
      adminPassword,
      companyName: company,
    });
    console.warn(`✔ roles, permissions and platform admin (${adminEmail})`);
    if ((isProd && !demoMode) || process.env.SEED_DEMO === 'false') {
      console.warn('✔ seed complete (no demo data)');
      return;
    }
    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass-2026';
    await seedDemo(prisma, {
      mockUrl: process.env.MOCK_UPSTREAM_URL ?? 'http://127.0.0.1:4010',
      demoPassword,
      adminUserId: user.id,
    });
    console.warn(
      `✔ DEMO data: demo@acme.test / agency@northwind.test, password "${demoPassword}"`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runSeed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
