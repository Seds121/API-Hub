import { expect, test } from '@playwright/test';

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test('customer: register → top up (demo payment) → create key → call API in playground → see usage & charge', async ({ page }) => {
  const email = `e2e${unique()}@example.com`;
  await page.goto('/register');
  await page.fill('#name', 'E2E Tester');
  await page.fill('#email', email);
  await page.fill('#org', 'E2E Corp');
  await page.fill('#password', 'E2e-Passw0rd-123');
  await page.check('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard?welcome=1');
  await expect(page.getByText('Welcome aboard')).toBeVisible();

  // Top up via the dev-only demo gateway (signed webhook path on the server).
  await page.goto('/dashboard/billing');
  await page.getByRole('button', { name: 'Add credits' }).click();
  await page.getByRole('button', { name: '$25' }).click();
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByRole('option', { name: /Demo payment/ }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL('**/mock-checkout**');
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();
  await page.waitForURL('**/dashboard/billing');
  await expect(page.getByText('$25.00').first()).toBeVisible();

  // Create a key — secret is shown once.
  await page.goto('/dashboard/keys');
  await page.getByRole('button', { name: 'Create key' }).first().click();
  await page.fill('#kname', 'e2e key');
  await page.getByRole('dialog').getByRole('button', { name: 'Create key' }).click();
  const secret = (await page.locator('pre code').first().textContent())!.trim();
  expect(secret).toMatch(/^zz_live_/);
  await page.getByRole('button', { name: 'I’ve stored it safely' }).click();
  await expect(page.getByText('e2e key')).toBeVisible();

  // Playground call through the gateway.
  await page.goto('/dashboard/playground?api=social-profiles');
  await page.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'GET /profile' }).click();
  await page.fill('#pkey', secret);
  await page.fill('#p-username', 'playwright');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('cost $0.015000')).toBeVisible();
  await expect(page.getByText('"username": "playwright"')).toBeVisible();

  // Usage & wallet reflect the call.
  await page.goto('/dashboard/usage');
  await expect(page.getByRole('cell', { name: 'Social Profiles' }).first()).toBeVisible();
  await page.goto('/dashboard/billing');
  await expect(page.getByText('$24.985').first()).toBeVisible();
});

test('admin: providers, licensing gate and integration test from the console', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', process.env.E2E_ADMIN_EMAIL ?? 'admin@zeze.local');
  await page.fill('#password', process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe-Admin-2026');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/(admin|dashboard)/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();

  await page.goto('/admin/providers');
  await page.getByRole('link', { name: 'Demo RapidAPI — Social Graph' }).click();
  await expect(page.getByText('X-RapidAPI-Key', { exact: false }).first()).toBeHidden(); // secret never rendered
  await page.getByRole('tab', { name: /Integrations/ }).click();
  await page.getByRole('button', { name: 'Test' }).first().click();
  await page.getByLabel(/username/).fill('admintest');
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByText('"username": "admintest"')).toBeVisible();

  // Unlicensed draft cannot be published.
  await page.goto('/admin/products');
  await page.getByRole('link', { name: 'AI Text Summarization' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Cannot publish yet')).toBeVisible();
  await expect(page.getByRole('main').getByText(/No verified redistribution license/)).toBeVisible();
});

test('admin: Brave Search is a first-class connector in the provider form', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', process.env.E2E_ADMIN_EMAIL ?? 'admin@zeze.local');
  await page.fill('#password', process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe-Admin-2026');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/(admin|dashboard)/);
  await page.goto('/admin/providers');
  await page.getByRole('button', { name: 'Add provider' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Brave Search' }).click();
  await expect(dialog.locator('#pb')).toHaveValue('https://api.search.brave.com');
  await expect(dialog.getByText('X-Subscription-Token').first()).toBeVisible();
  await expect(dialog.locator('#rh')).toHaveCount(0); // no RapidAPI host field
  await expect(dialog.getByText('Auth method')).toHaveCount(0); // auth locked by the connector
});
