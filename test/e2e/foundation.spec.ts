import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testDatabase, seedPurchase } from '../integration/helpers';
import { users, passwordCredentials, entitlements } from '../../src/db/schema';
import { hashPassword } from '../../src/lib/security';
import { createServiceFactories } from '../../src/composition/service-factories';
import { BillingService } from '../../src/modules/billing/service';
import { DeploymentService } from '../../src/modules/deployment/service';
const password = 'E2e-fixture-password-only';
const { db, pool, env } = testDatabase();
let adminEmail: string, userEmail: string, deploymentLabel: string, orderId: string;
test.beforeAll(async () => {
  const fixture = await seedPurchase(db);
  userEmail = fixture.user.email;
  orderId = fixture.order.id;
  adminEmail = `admin-${randomUUID()}@example.test`;
  const [admin] = await db
    .insert(users)
    .values({ email: adminEmail, role: 'admin', emailVerified: true })
    .returning();
  if (!admin) throw new Error('Missing test fixture: admin');
  for (const userId of [admin.id, fixture.user.id])
    await db.insert(passwordCredentials).values({ userId, passwordHash: hashPassword(password) });
  const factories = createServiceFactories();
  await new BillingService(factories, db, env).handlePaymentNotification({
    kind: 'paid',
    provider: 'wechat_pay',
    providerEventId: fixture.order.orderNo,
    orderNo: fixture.order.orderNo,
    providerOrderId: 'fixture',
    amount: 100,
    currency: 'CNY',
    paidAt: new Date(),
    payload: {},
  });
  const [entitlement] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.sourceId, fixture.order.id));
  if (!entitlement) throw new Error('Missing test fixture: entitlement');
  deploymentLabel = 'Browser fixture ' + randomUUID();
  await new DeploymentService(factories, db, env).createDeployment({
    userId: fixture.user.id,
    appCode: fixture.app.code,
    entitlementId: entitlement.id,
    label: deploymentLabel,
    environment: 'production',
    serverHost: '192.0.2.10',
  });
});
test.afterAll(() => pool.end());
async function login(page: import('@playwright/test').Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.locator('form button[type="submit"]').click();
}
test('user login, orders, entitlements and deployment survive deep-route refresh', async ({
  page,
}) => {
  await login(page, '/login', userEmail);
  await expect(page).toHaveURL(/\/account/);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'fd_core_session')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('fd_core_token'))).toBeNull();
  const orders = page.waitForResponse(
    (response) => response.url().includes('/v1/billing/orders/me') && response.status() === 200,
  );
  await page.goto('/account?tab=orders');
  expect(
    (await (await orders).json()).items.some((item: { id: string }) => item.id === orderId),
  ).toBe(true);
  const access = page.waitForResponse(
    (response) => response.url().includes('/v1/entitlements/me') && response.status() === 200,
  );
  await page.goto('/account?tab=apps');
  expect((await (await access).json()).items.length).toBeGreaterThan(0);
  await page.goto('/deploy');
  await expect(page.getByText(deploymentLabel, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(deploymentLabel, { exact: true })).toBeVisible();
});
test('admin settings numeric inputs use Zod output and optimistic version on save', async ({
  page,
}) => {
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/settings');
  await page.getByRole('tab', { name: 'SMTP', exact: true }).click();
  await page.getByLabel('SMTP Host', { exact: true }).fill('smtp.example.test');
  await page.getByLabel('端口', { exact: true }).fill('587');
  await page.getByLabel('发件人邮箱', { exact: true }).fill('sender@example.test');
  const save = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/admin/system-settings/smtp') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存 SMTP 配置', exact: true }).click();
  const result = await save;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().port).toBe(587);
  expect(result.request().headers()['if-match']).toBeTruthy();
  await page.reload();
  await page.getByRole('tab', { name: 'SMTP', exact: true }).click();
  await expect(page.getByLabel('端口', { exact: true })).toHaveValue('587');
});
test('ordinary user cannot enter the admin console or invoke admin settings', async ({ page }) => {
  await login(page, '/admin/login', userEmail);
  await expect(page.getByText('该账号没有管理后台访问权限', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, '/login', userEmail);
  await expect(page).toHaveURL(/\/account/);
  const status = await page.evaluate(
    async () => (await fetch('/v1/admin/system-settings/smtp', { credentials: 'include' })).status,
  );
  expect(status).toBe(403);
  await page.goto('/admin/settings');
  await expect(page).not.toHaveURL(/\/admin\/settings$/);
});
test('browser logout revokes the server session and a refreshed protected route requires login', async ({
  page,
}) => {
  await login(page, '/login', userEmail);
  await expect(page).toHaveURL(/\/account/);
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === 'fd_core_session')!;
  const csrf = cookies.find((cookie) => cookie.name === 'fd_core_csrf')!;
  const result = await page.request.post('/v1/auth/session/logout', {
    headers: { 'x-csrf-token': csrf.value },
  });
  expect(result.status()).toBe(200);
  const replay = await page.request.get('/v1/me', {
    headers: { cookie: `fd_core_session=${session.value}` },
  });
  expect(replay.status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});
