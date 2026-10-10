import { z } from 'zod';
import type { AiModelSummary } from '@/api/types';
export const optionalUrlField = z.preprocess(
  (value: string) => (typeof value === 'string' ? value.trim() : value),
  z.union([z.string().url('请输入有效链接'), z.literal('')]),
);

export const optionalSiteLinkField = z.preprocess(
  (value: string) => (typeof value === 'string' ? value.trim() : value),
  z
    .union([
      z.string().startsWith('/'),
      z.string().url('请输入有效链接'),
      z.string().startsWith('mailto:'),
      z.string().startsWith('tel:'),
      z.literal(''),
    ])
    .refine((value) => Boolean(value) || value === '', '请输入有效链接'),
);

export const siteLinkSchema = z.object({
  label: z.string().trim().min(1, '请输入链接名称').max(60, '名称不能超过 60 个字符'),
  url: optionalSiteLinkField.refine((value) => Boolean(value), '请输入链接地址'),
  openInNewTab: z.boolean().optional(),
});

export const siteNavigationChildSchema = siteLinkSchema;

export const siteNavigationItemSchema = z
  .object({
    label: z.string().trim().min(1, '请输入一级菜单名称').max(60, '名称不能超过 60 个字符'),
    url: optionalSiteLinkField,
    openInNewTab: z.boolean().optional(),
    children: z.array(siteNavigationChildSchema).max(12, '二级菜单最多 12 项'),
  })
  .refine(
    (value) => Boolean(value.url) || value.children.length > 0,
    '一级菜单至少配置链接或一个二级菜单',
  );

export const siteSchema = z.object({
  siteName: z.string().trim().min(1, '请输入站点名称').max(120, '站点名称不能超过 120 个字符'),
  logoUrl: optionalSiteLinkField,
  faviconUrl: optionalSiteLinkField,
  brandPrimaryColor: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6}|)$/, '请输入 #RRGGBB 形式的颜色值或留空'),
  headerNavigation: z.array(siteNavigationItemSchema).max(12, '顶部导航最多保留 12 项'),
  footerCopyright: z
    .string()
    .trim()
    .min(1, '请输入页脚版权')
    .max(255, '页脚版权不能超过 255 个字符'),
  filingInfo: z.string().trim().max(255, '备案信息不能超过 255 个字符'),
  footerLinks: z.array(siteLinkSchema).max(12, '最多保留 12 个页脚链接'),
});

export const openrouterSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: optionalUrlField,
  siteUrl: optionalUrlField,
  siteName: z.string().optional(),
  defaultModel: z.string().optional(),
});

export const contentImportSchema = z.object({
  wordpressSiteUrl: optionalUrlField,
  wordpressUsername: z.string().optional(),
  wordpressAppPassword: z.string().optional(),
  notionApiToken: z.string().optional(),
});

export const hubContentSchema = z.object({
  eyebrow: z.string().trim().max(60, '不能超过 60 个字符').optional(),
  title: z.string().trim().max(120, '不能超过 120 个字符').optional(),
  description: z.string().trim().max(500, '不能超过 500 个字符').optional(),
});

export const publicPagesSchema = z.object({
  contentHub: hubContentSchema,
  docsHub: hubContentSchema,
});

export type SiteValues = z.infer<typeof siteSchema>;
export type OpenRouterValues = z.infer<typeof openrouterSchema>;
export type ContentImportValues = z.infer<typeof contentImportSchema>;
export type PublicPagesValues = z.infer<typeof publicPagesSchema>;

export function buildSitePayload(values: SiteValues) {
  return {
    siteName: values.siteName.trim(),
    logoUrl: values.logoUrl.trim(),
    faviconUrl: values.faviconUrl.trim(),
    brandPrimaryColor: values.brandPrimaryColor.trim(),
    headerNavigation: values.headerNavigation.map((item) => ({
      label: item.label.trim(),
      url: item.url.trim(),
      openInNewTab: Boolean(item.openInNewTab),
      children: item.children.map((child) => ({
        label: child.label.trim(),
        url: child.url.trim(),
        openInNewTab: Boolean(child.openInNewTab),
      })),
    })),
    footerCopyright: values.footerCopyright.trim(),
    filingInfo: values.filingInfo.trim(),
    footerLinks: values.footerLinks.map((item) => ({
      label: item.label.trim(),
      url: item.url.trim(),
      openInNewTab: Boolean(item.openInNewTab),
    })),
  };
}

export function buildOpenRouterPayload(
  values: OpenRouterValues,
  options: { includeApiKey: boolean },
) {
  const apiKey = values.apiKey?.trim();
  const baseUrl = values.baseUrl?.trim();
  const siteUrl = values.siteUrl?.trim();
  const siteName = values.siteName?.trim();
  const defaultModel = values.defaultModel?.trim();

  return {
    ...(options.includeApiKey && apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    ...(siteName ? { siteName } : {}),
    ...(defaultModel ? { defaultModel } : {}),
  };
}

export function buildContentImportPayload(
  values: ContentImportValues,
  options: { includeWordPressPassword: boolean; includeNotionToken: boolean },
) {
  const wordpressSiteUrl = values.wordpressSiteUrl?.trim();
  const wordpressUsername = values.wordpressUsername?.trim();
  const wordpressAppPassword = values.wordpressAppPassword?.trim();
  const notionApiToken = values.notionApiToken?.trim();

  return {
    wordpress: {
      ...(wordpressSiteUrl ? { siteUrl: wordpressSiteUrl } : {}),
      ...(wordpressUsername ? { username: wordpressUsername } : {}),
      ...(options.includeWordPressPassword && wordpressAppPassword
        ? { appPassword: wordpressAppPassword }
        : {}),
    },
    notion: {
      ...(options.includeNotionToken && notionApiToken ? { apiToken: notionApiToken } : {}),
    },
  };
}

export function sourceLabel(source: 'database' | 'env' | 'none') {
  if (source === 'database') {
    return '数据库';
  }

  if (source === 'env') {
    return '环境变量';
  }

  return '未配置';
}

export function formatCompactNumber(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '—';
  }

  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPricePerMillion(value: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return `$${(parsed * 1_000_000).toFixed(2)} / 1M`;
}

export function formatModelOptionLabel(model: AiModelSummary) {
  const name = model.name || model.id;
  const context = formatCompactNumber(model.contextLength);
  const promptPrice = formatPricePerMillion(model.promptPricing);
  return `${name} [${context}] ${promptPrice}`;
}

export function formatModalities(values: string[]) {
  return values.length ? values.join(', ') : '—';
}

export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
