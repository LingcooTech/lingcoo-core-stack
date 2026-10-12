import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

test('public developer documentation supports discovery, refresh and canonical AI downloads', async ({
  page,
  request,
}) => {
  await page.goto('/docs');
  await page.getByRole('link', { name: /开发者中心/ }).click();
  await expect(page.getByRole('heading', { name: 'Stack 开发者中心', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: '开发文档' })
    .getByRole('link', { name: '接入与交付标准' })
    .click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '仓库应用定义与交付版本标准', exact: true }),
  ).toBeVisible();
  const raw = await page.getByRole('link', { name: '原始 Markdown' }).getAttribute('href');
  expect(raw).toBe('/developer-docs/docs/stack-application-definition-standard.md');
  const response = await request.get(raw!);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('text/plain');
  const text = await response.text();
  const index = await (await request.get('/developer-docs/index.json')).json();
  const standard = index.items.find((item: { id: string }) => item.id === 'standard');
  expect(standard.content).toBe(text);
  expect(standard.sha256).toBe(createHash('sha256').update(text).digest('hex'));
  await page.getByRole('link', { name: '开发交付模板说明', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Stack 应用开发与交付模板', exact: true }),
  ).toBeVisible();
  expect((await request.get('/developer-docs/.env')).status()).toBe(404);
});
