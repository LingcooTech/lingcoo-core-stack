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
let adminEmail: string,
  userEmail: string,
  deploymentLabel: string,
  orderNo: string,
  appName: string;
test.beforeAll(async () => {
  const fixture = await seedPurchase(db);
  userEmail = fixture.user.email;
  orderNo = fixture.order.orderNo;
  appName = fixture.app.name;
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
  await page.goto('/account?tab=orders');
  await expect(page.getByText(orderNo, { exact: true }).first()).toBeVisible();
  await page.goto('/account?tab=apps');
  await expect(page.getByText(appName, { exact: true }).first()).toBeVisible();
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
  await page.goto('/admin/storage');
  await expect(page.getByRole('button', { name: '新建文件夹', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '新建文件夹', exact: true })).toBeVisible();
  await page.goto('/admin/settings');
  await page.getByRole('button', { name: '云存储', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('link', { name: '存储设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '文件存储', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '邮件服务', exact: true }).click();
  await page
    .getByLabel('邮件服务器地址', { exact: true })
    .fill(`smtp-${randomUUID()}.example.test`);
  await page.getByLabel('邮件服务器端口', { exact: true }).fill('587');
  await page.getByLabel('发件地址', { exact: true }).fill('sender@example.test');
  const save = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/admin/system-settings/smtp') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  const result = await save;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().port).toBe(587);
  expect(result.request().headers()['if-match']).toBeTruthy();
  await page.reload();
  await page.getByRole('tab', { name: '邮件服务', exact: true }).click();
  await expect(page.getByLabel('邮件服务器端口', { exact: true })).toHaveValue('587');
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
test('admin navigation, command search and mobile menu preserve route access', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('menuitem', { name: '订单管理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起边栏', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开边栏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开边栏', exact: true }).click();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog').getByLabel('搜索页面、资源、操作', { exact: true });
  await search.fill('应用部署');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/admin\/deployments$/);
  await expect(page.getByRole('region', { name: '应用部署', exact: true })).toBeVisible();
  await expect(page.getByText(deploymentLabel, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('admin-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
  await page.getByRole('dialog').getByRole('menuitem', { name: '订单管理', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(page.getByRole('region', { name: '订单管理', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('admin-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
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

test('unsaved admin settings block navigation and preserve the draft when editing continues', async ({
  page,
}) => {
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/settings?tab=smtp');
  await page.getByLabel('发件名称', { exact: true }).fill('Unsaved fixture brand');
  await page.getByRole('menuitem', { name: '订单管理', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page.getByLabel('发件名称', { exact: true })).toHaveValue('Unsaved fixture brand');
  await page.getByRole('menuitem', { name: '订单管理', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '放弃修改并离开', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '订单管理', exact: true })).toBeVisible();
});

test('admin creates an application, content and documentation through Ant Design forms', async ({
  page,
}) => {
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  const code = 'browser_app_' + randomUUID().replaceAll('-', '').slice(0, 12);
  await page.goto('/admin/apps/new');
  await page.locator('#app-editor_app_appCode').fill(code);
  await page.locator('#app-editor_app_name').fill('Browser application');
  await page.getByRole('button', { name: '保存应用配置', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/apps/${code}/edit$`));
  await page.reload();
  await expect(page.locator('#app-editor_app_name')).toHaveValue('Browser application');
  const slug = 'browser-content-' + randomUUID();
  await page.goto('/admin/content/new');
  await page.locator('#content-editor_title').fill('Browser content');
  await page.locator('#content-editor_slug').fill(slug);
  await page.getByLabel('正文内容', { exact: true }).fill('# Browser fixture');
  await page.getByRole('button', { name: '保存内容', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/content\/[^/]+\/edit$/);
  await page.reload();
  await expect(page.locator('#content-editor_title')).toHaveValue('Browser content');
  await page.goto('/admin/docs');
  await page.getByRole('button', { name: '新建空间', exact: true }).click();
  await page.locator('#doc-space_title').fill('Browser documentation');
  await page.locator('#doc-space_slug').fill(slug);
  await page.getByRole('button', { name: '保存空间', exact: true }).click();
  await expect(page.getByRole('tab', { name: '文档页面', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '文档页面', exact: true }).click();
  await page.locator('#doc-page_title').fill('Getting started');
  await page.locator('#doc-page_slug').fill('getting-started');
  await page.locator('#doc-page_content').fill('# Setup');
  await page.getByRole('button', { name: '保存页面', exact: true }).click();
  await expect(page.getByRole('tree').getByText('Getting started', { exact: true })).toBeVisible();
});
