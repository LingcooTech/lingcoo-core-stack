import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  await page.getByRole('dialog').getByRole('button', { name: '存储设置', exact: true }).click();
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
test('dashboard filtered links and storage settings return navigation remain usable', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: '查看订单', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders\?status=pending$/);
  await expect(
    page.locator('.ant-select').filter({ has: page.getByLabel('订单状态', { exact: true }) }),
  ).toContainText('待支付');
  await expect(page.getByRole('table')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await page.goto('/admin');
  await page.getByRole('button', { name: '处理工单', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\?status=waiting_staff$/);
  await expect(
    page.getByRole('region', { name: '工单管理', exact: true }).getByRole('table'),
  ).toBeVisible();
  await page.goto('/admin/storage');
  await expect(
    page.getByText('统一管理图片、PDF 和 UTF-8 文本；替换文件保持素材链接稳定。'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '存储设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '返回云存储', exact: true })).toBeVisible();
  const prefix = page.getByLabel('默认上传目录', { exact: true });
  await expect(prefix).toBeVisible();
  const original = await prefix.inputValue();
  await prefix.fill('browser-return-draft');
  await page.getByRole('button', { name: '返回云存储', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(prefix).toHaveValue('browser-return-draft');
  await prefix.fill(original);
  await page.getByRole('button', { name: '返回云存储', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/storage$/);
  await page.getByRole('button', { name: '存储设置', exact: true }).click();
  await prefix.fill(`browser-return-${randomUUID()}`);
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/admin/system-settings/storage') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('button', { name: /保存配置$/ })).toBeDisabled();
  await expect(
    page
      .getByRole('tabpanel', { name: '文件存储', exact: true })
      .getByText('敏感项留空保留原值', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '返回云存储', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/storage$/);
  expect(errors).toEqual([]);
});
test('contextual admin commands and announcement draft drawer work on desktop and mobile', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/admin',
      '/admin/docs',
      '/admin/storage',
      '/admin/notifications',
      '/admin/hosting',
      '/admin/settings',
    ]) {
      await page.goto(route);
      await expect(page.getByRole('region').last()).toBeVisible();
      if (route === '/admin/docs') {
        await expect(
          page
            .locator('.ant-card')
            .filter({ has: page.getByText('文档空间', { exact: true }) })
            .getByRole('button', { name: '新建空间', exact: true }),
        ).toBeVisible();
      }
      if (route === '/admin/hosting') {
        await expect(
          page.locator('.admin-toolbar').getByRole('button', { name: '添加服务器', exact: true }),
        ).toBeVisible();
      }
      if (route === '/admin/settings') {
        await expect(page.getByLabel('搜索设置', { exact: true })).toBeVisible();
        if (width >= 992)
          await expect(
            page.locator('.ant-tabs-nav').getByLabel('搜索设置', { exact: true }),
          ).toBeVisible();
        const selectedTab = await page
          .getByRole('tab', { name: '品牌与页脚', exact: true })
          .boundingBox();
        expect(selectedTab!.x).toBeGreaterThanOrEqual(0);
        expect(selectedTab!.x + selectedTab!.width).toBeLessThanOrEqual(width);
      }
      await expect(page.locator('.admin-main')).toHaveCSS(
        'margin-left',
        width < 768 ? '0px' : '240px',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`feedback-${route.split('/').at(-1) || 'dashboard'}-${width}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    }
    await page.goto('/admin/notifications');
    await page.getByRole('button', { name: '发布公告', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '发布公告', exact: true });
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('公告标题', { exact: true }).fill('Unsaved local fixture');
    await drawer.getByRole('button', { name: /^取\s*消$/ }).click();
    await page
      .getByRole('dialog', { name: '放弃未发布的公告？', exact: true })
      .getByRole('button', { name: '继续编辑', exact: true })
      .click();
    await expect(drawer.getByLabel('公告标题', { exact: true })).toHaveValue(
      'Unsaved local fixture',
    );
    await page.screenshot({
      path: info.outputPath(`announcement-${width}.png`),
      fullPage: false,
      animations: 'disabled',
    });
    await drawer.getByRole('button', { name: /^取\s*消$/ }).click();
    await page
      .getByRole('dialog', { name: '放弃未发布的公告？', exact: true })
      .getByRole('button', { name: /^放\s*弃$/ })
      .click();
    await expect(drawer).toBeHidden();
  }
});
test('admin navigation, command search and mobile menu preserve route access', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('menuitem', { name: '交易管理', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '订单管理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起边栏', exact: true }).click();
  await page.locator('.admin-brand').hover();
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
  const mobileTrade = page
    .getByRole('dialog')
    .getByRole('menuitem', { name: '交易管理', exact: true });
  if ((await mobileTrade.getAttribute('aria-expanded')) !== 'true') await mobileTrade.click();
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
  await page.getByRole('menuitem', { name: '交易管理', exact: true }).click();
  await page.getByRole('menuitem', { name: '订单管理', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true })).toBeHidden();
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

test('hosting resource registration keeps allocation paused and budget edits survive reload', async ({
  page,
}, info) => {
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/hosting');
  await page.getByRole('button', { name: '添加服务器', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加服务器资源', exact: true });
  const name = 'Browser monitor ' + randomUUID().slice(0, 8);
  await dialog.getByLabel('节点名称', { exact: true }).fill(name);
  await dialog
    .getByLabel('服务器 IP', { exact: true })
    .fill('192.0.2.' + (10 + Math.floor(Math.random() * 200)));
  await dialog.getByRole('button', { name: '登记服务器', exact: true }).click();
  await expect(dialog.getByText('健康上报凭据仅显示一次', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '已保存，隐藏凭据', exact: true }).click();
  const card = page.locator('.ant-card').filter({ has: page.getByText(name, { exact: true }) });
  await expect(card.getByText('暂停新分配', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '编辑资产与预算', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑资产与预算', exact: true });
  await editor.getByLabel('托管内存预算（MiB）', { exact: true }).fill('768');
  await editor.getByRole('button', { name: '保存节点配置', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(card.getByText('托管内存预留：0 / 768 MiB', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('hosting-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('hosting-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('all admin routes and legacy redirects render, with responsive themed forms and public pages', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  const apps = await (await page.request.get('/v1/admin/apps')).json();
  const content = await (await page.request.get('/v1/admin/content?limit=1')).json();
  const routes = [
    '/admin',
    '/admin/apps',
    '/admin/apps/new',
    `/admin/apps/${apps.items[0].code}/edit`,
    '/admin/content',
    '/admin/content/new',
    `/admin/content/${content.items[0].id}/edit`,
    '/admin/storage',
    '/admin/docs',
    '/admin/secrets',
    '/admin/orders',
    '/admin/payments',
    '/admin/settings',
    '/admin/licenses',
    '/admin/tickets',
    '/admin/users',
    '/admin/installs',
    '/admin/notifications',
    '/admin/hosting',
    '/admin/deployments',
    '/admin/observability',
  ];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('.admin-page')).toBeVisible();
    await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);
  }
  for (const [from, to] of [
    ['catalog', 'apps'],
    ['delivery', 'apps'],
    ['operations', 'orders'],
  ]) {
    await page.goto(`/admin/${from}`);
    await expect(page).toHaveURL(new RegExp(`/admin/${to}$`));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '仪表盘', exact: true })).toBeVisible();
  await expect(page.locator('.admin-sider-user__copy')).toBeVisible();
  await expect(page.locator('.admin-sider-user .ant-avatar')).toHaveCSS('width', '34px');
  await expect(page.locator('.admin-sider-user .ant-avatar')).toHaveCSS('height', '34px');
  await expect(page.getByRole('button', { name: '打开账户菜单', exact: true })).toBeVisible();
  await expect(page.locator('.admin-content')).toHaveCSS('background-color', 'rgb(244, 246, 250)');
  await page.getByRole('button', { name: '收起边栏', exact: true }).click();
  await expect(page.locator('.admin-sider')).toHaveCSS('width', '72px');
  await expect(page.locator('.admin-brand--collapsed')).toHaveCSS('height', '64px');
  await expect(page.locator('.admin-sider__footer--collapsed')).toBeVisible();
  await expect(page.locator('.admin-sider-user__copy')).toHaveCount(0);
  await page.locator('.admin-brand').hover();
  await expect(page.getByRole('button', { name: '打开边栏', exact: true })).toHaveCSS(
    'opacity',
    '1',
  );
  await page.screenshot({ path: info.outputPath('sidebar-collapsed.png'), fullPage: true });
  await page.getByRole('button', { name: '打开边栏', exact: true }).click();
  await expect(page.locator('.admin-sider')).toHaveCSS('width', '240px');
  await page.screenshot({ path: info.outputPath('dashboard-expanded.png'), fullPage: true });
  await page.goto('/admin/observability');
  for (const path of [
    'events',
    'billing-webhooks',
    'jobs',
    'audit-logs',
    'observability/summary',
  ]) {
    const response = await page.request.get('/v1/admin/' + path);
    expect(response.status(), path).toBe(200);
  }
  await expect(page.getByText('Unexpected server error', { exact: true })).toHaveCount(0);
  for (const width of [1920, 1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    let expectedBounds: { x: number; width: number } | undefined;
    for (const route of ['/admin/apps', '/admin/apps/new', '/admin/settings', '/admin/payments']) {
      await page.goto(route);
      await expect(page.locator('.admin-page')).toBeVisible();
      // useBreakpoint resolves after mount; measure after the sidebar margin transition settles.
      await expect(page.locator('.admin-main')).toHaveCSS(
        'margin-inline-start',
        width >= 992 ? '240px' : '0px',
      );
      const bounds = await page.locator('.admin-page').boundingBox();
      expect(bounds).toBeTruthy();
      if (!expectedBounds) expectedBounds = bounds!;
      expect(bounds!.x, route).toBeCloseTo(expectedBounds.x, 0);
      expect(bounds!.width, route).toBeCloseTo(expectedBounds.width, 0);
      expect(bounds!.width).toBeLessThanOrEqual(1440);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    }
    await page.goto('/admin/apps');
    await expect(page.locator('.admin-metrics > .admin-metric')).toHaveCount(4);
    await page.screenshot({ path: info.outputPath(`apps-${width}.png`) });
    await page.goto('/admin/apps/new');
    await expect(page.getByRole('button', { name: '返回列表', exact: true })).toBeVisible();
    await expect(page.locator('.admin-toolbar')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`app-editor-${width}.png`) });
    await page.getByRole('button', { name: '返回列表', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/apps$/);
  }
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/settings?tab=smtp');
    await expect(page.getByLabel('发件名称', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`settings-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('.admin-sider--dark')).toHaveCSS('background-color', 'rgb(20, 20, 20)');
  await expect(page.locator('.admin-content')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.screenshot({ path: info.outputPath('settings-dark.png'), fullPage: true });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  for (const route of ['/', '/content', '/docs', '/account']) {
    await page.goto(route);
    await expect(page.locator('main').first()).toBeVisible();
    expect(await page.locator('.stack-admin').count()).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('admin detail drawers and editing modals fit desktop and mobile without writing business data', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const resources: string[] = [];
  page.on('response', (response) => resources.push(new URL(response.url()).pathname));
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) {
      await page.getByRole('button', { name: '切换主题', exact: true }).click();
      await expect(page.locator('html')).toHaveClass(/dark/);
    }
    await page.goto('/admin/orders');
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('基本信息', { exact: true })).toBeVisible();
    await expect(drawer.getByText('购买明细', { exact: true })).toBeVisible();
    // Measure the settled layout: a translated animation frame can introduce
    // floating-point error in getBoundingClientRect even at an integer width.
    await expect(page.locator('.ant-drawer-content-wrapper')).toHaveCSS('transform', 'none');
    const box = await drawer.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({
      path: info.outputPath(`order-detail-${width}.png`),
      animations: 'disabled',
    });
    await drawer.getByRole('button', { name: '关闭', exact: true }).last().click();
    await expect(drawer).toBeHidden();
    await page.goto('/admin/users');
    await page
      .getByRole('button', { name: /^编\s*辑$/ })
      .first()
      .click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('button', { name: /^保\s*存$/ })).toBeVisible();
    await expect(page.locator('.ant-modal')).toHaveCSS('transform', 'none');
    const modalBox = await modal.boundingBox();
    expect(modalBox!.x).toBeGreaterThanOrEqual(0);
    expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: info.outputPath(`user-modal-${width}.png`),
      animations: 'disabled',
    });
    await modal.getByRole('button', { name: /^取\s*消$/ }).click();
    await expect(modal).toBeHidden();
  }
  expect(
    resources.filter((path) => /\/(?:PortalUiProvider|UserShell|DocsShell)-/.test(path)),
  ).toEqual([]);
});

// Real application manifests are copied from their repositories; all writes stay in the disposable test database.
test('Retail and Edu manifests render dynamically and survive an application edit', async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page, '/admin/login', adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  for (const sample of ['retail', 'edu']) {
    const manifest = JSON.parse(
      readFileSync(resolve(`test/fixtures/app-manifests/${sample}.json`), 'utf8'),
    ) as Record<string, unknown>;
    const code = `browser_${sample}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const response = await page.request.put(`/v1/admin/apps/${code}`, {
      headers: {
        'x-csrf-token': (await page.context().cookies()).find(
          (cookie) => cookie.name === 'fd_core_csrf',
        )!.value,
      },
      data: {
        name: `Sample ${sample}`,
        type: 'web_app',
        status: 'inactive',
        features: [],
        plans: [],
        offers: [],
        meta: { deliveryMode: 'one_click', deliveryManifest: manifest },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await page.goto(`/admin/apps/${code}/edit`);
    await page.getByRole('tab', { name: '交付配置', exact: true }).click();
    await expect(
      page.getByLabel(sample === 'retail' ? 'Retail 运行镜像 digest' : 'Edu 运行镜像 digest', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('tab', { name: '基本信息', exact: true }).click();
    await page.locator('#app-editor_app_name').fill(`Updated ${sample}`);
    await page.getByRole('tab', { name: '展示内容', exact: true }).click();
    await page.locator('.w-md-editor-text-input').fill(`# ${sample} detail`);
    await page.getByRole('tab', { name: '基本信息', exact: true }).click();
    await page.getByRole('button', { name: '保存应用配置', exact: true }).click();
    await expect(page.getByText('应用配置已保存', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('#app-editor_app_name')).toHaveValue(`Updated ${sample}`);
    await page.getByRole('tab', { name: '展示内容', exact: true }).click();
    await expect(page.locator('.w-md-editor-text-input')).toHaveValue(`# ${sample} detail`);
    const apps = await (await page.request.get('/v1/admin/apps')).json();
    expect(
      apps.items.find((app: { code: string }) => app.code === code).meta.deliveryManifest,
    ).toEqual(manifest);
  }
});
