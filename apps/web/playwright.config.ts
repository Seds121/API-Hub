import { defineConfig } from '@playwright/test';

/**
 * Browser E2E against running servers (API :4000 with mock upstream :4010, web :3000).
 * Start them with `pnpm dev:api`, `pnpm --filter @zeze/api mock-upstream`, `pnpm dev:web` (or prod builds) after seeding.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'off', viewport: { width: 1366, height: 900 } },
  reporter: [['list']],
});
