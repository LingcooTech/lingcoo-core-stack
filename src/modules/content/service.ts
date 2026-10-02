import { pickContentDependencies, type ContentDependencies } from './dependencies';
import * as cheerio from 'cheerio';

import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';

import { ContentRepository } from './repository';

type ContentSourceType = 'manual' | 'wordpress' | 'notion' | 'wechat';
type ContentStatus = 'draft' | 'published' | 'archived';

type ImportedContentDraft = {
  title: string;
  excerpt: string;
  content: string;
  coverUrl?: string | null;
  authorName?: string | null;
  sourceType: ContentSourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
  publishedAt?: Date | null;
  meta?: Record<string, unknown>;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalUrl(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildExcerpt(content: string, fallback = '') {
  const source = stripHtml(content) || fallback.trim();
  return truncate(source, 180);
}

function basicAuthHeader(username?: string, appPassword?: string) {
  const safeUsername = normalizeString(username);
  const safePassword = normalizeString(appPassword);
  if (!safeUsername || !safePassword) {
    return undefined;
  }

  return `Basic ${Buffer.from(`${safeUsername}:${safePassword}`).toString('base64')}`;
}

function parseWordPressSlugFromUrl(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments.at(-1) ?? '';
  } catch {
    return '';
  }
}

function parseWordPressIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    const numericId = url.searchParams.get('p');
    return numericId && /^\d+$/.test(numericId) ? numericId : '';
  } catch {
    return '';
  }
}

function normalizeNotionId(value: string) {
  const raw = value.trim();
  const cleaned = raw.replace(/[^a-fA-F0-9]/g, '');

  if (cleaned.length !== 32) {
    return raw;
  }

  return [
    cleaned.slice(0, 8),
    cleaned.slice(8, 12),
    cleaned.slice(12, 16),
    cleaned.slice(16, 20),
    cleaned.slice(20),
  ].join('-');
}

function extractNotionPageId(input: { pageUrl?: string; pageId?: string }) {
  const explicitId = normalizeString(input.pageId);
  if (explicitId) {
    return normalizeNotionId(explicitId);
  }

  const pageUrl = normalizeString(input.pageUrl);
  if (!pageUrl) {
    return '';
  }

  const matched = pageUrl.match(/([a-fA-F0-9]{32})/);
  return matched ? normalizeNotionId(matched[1]) : pageUrl;
}

type NotionRichText = {
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
};

type NotionBlock = Record<string, any> & {
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
};

function renderNotionRichText(items: NotionRichText[] | undefined) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return items
    .map((item) => {
      let output = htmlEscape(item.plain_text ?? '');

      if (item.annotations?.code) output = `<code>${output}</code>`;
      if (item.annotations?.bold) output = `<strong>${output}</strong>`;
      if (item.annotations?.italic) output = `<em>${output}</em>`;
      if (item.annotations?.underline) output = `<u>${output}</u>`;
      if (item.annotations?.strikethrough) output = `<s>${output}</s>`;
      if (item.href)
        output = `<a href="${htmlEscape(item.href)}" target="_blank" rel="noopener noreferrer">${output}</a>`;

      return output;
    })
    .join('');
}

function wrapTag(tag: string, inner: string, className?: string) {
  const classAttr = className ? ` class="${className}"` : '';
  return `<${tag}${classAttr}>${inner}</${tag}>`;
}

function renderNotionBlock(block: NotionBlock): string {
  const node = block[block.type] ?? {};
  const richText = renderNotionRichText(node.rich_text);
  const nested =
    Array.isArray(block.children) && block.children.length > 0
      ? renderNotionBlocks(block.children)
      : '';

  switch (block.type) {
    case 'paragraph':
      return wrapTag('p', richText || '&nbsp;');
    case 'heading_1':
      return wrapTag('h1', richText);
    case 'heading_2':
      return wrapTag('h2', richText);
    case 'heading_3':
      return wrapTag('h3', richText);
    case 'quote':
      return wrapTag('blockquote', richText + nested);
    case 'callout': {
      const icon = node.icon?.emoji ? `<span>${htmlEscape(node.icon.emoji)}</span> ` : '';
      return wrapTag('blockquote', `${icon}${richText}${nested}`);
    }
    case 'code':
      return `<pre><code>${htmlEscape((node.rich_text ?? []).map((item: NotionRichText) => item.plain_text ?? '').join(''))}</code></pre>`;
    case 'divider':
      return '<hr />';
    case 'image': {
      const imageUrl = node.type === 'external' ? node.external?.url : node.file?.url;
      const caption = renderNotionRichText(node.caption);
      if (!imageUrl) {
        return '';
      }
      return `<figure><img src="${htmlEscape(imageUrl)}" alt="${htmlEscape(stripHtml(caption))}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'bookmark': {
      const url = normalizeOptionalUrl(node.url);
      return url
        ? `<p><a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(url)}</a></p>`
        : '';
    }
    case 'bulleted_list_item':
    case 'numbered_list_item':
      return `<li>${richText}${nested}</li>`;
    case 'toggle':
      return `<details><summary>${richText}</summary>${nested}</details>`;
    case 'child_page':
      return wrapTag('h3', htmlEscape(node.title ?? 'Untitled'));
    default:
      return richText ? wrapTag('p', richText + nested) : nested;
  }
}

function renderNotionBlocks(blocks: NotionBlock[]) {
  const output: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const listTag = block.type === 'bulleted_list_item' ? 'ul' : 'ol';
      const items: string[] = [];

      while (index < blocks.length && blocks[index]?.type === block.type) {
        items.push(renderNotionBlock(blocks[index]));
        index += 1;
      }

      index -= 1;
      output.push(`<${listTag}>${items.join('')}</${listTag}>`);
      continue;
    }

    output.push(renderNotionBlock(block));
  }

  return output.join('\n');
}

export class ContentService {
  private readonly repository: ContentRepository;

  private readonly capabilities: ContentDependencies;
  constructor(
    capabilities: ContentDependencies,
    private readonly db: DbExecutor,
  ) {
    this.capabilities = pickContentDependencies(capabilities);
    this.repository = new ContentRepository(db);
  }

  async listContent(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: ContentStatus;
    sourceType?: ContentSourceType;
  }) {
    const result = await this.repository.listContent(query);

    return {
      items: result.items.map((item) => ({
        ...item,
        excerpt: item.excerpt ?? '',
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listPublishedContent(query: { limit: number; offset: number; search?: string }) {
    const result = await this.repository.listPublishedContent(query);
    return {
      items: result.items.map((item) => ({
        ...item,
        excerpt: item.excerpt ?? '',
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getContentById(contentId: string) {
    const item = await this.repository.findById(contentId);
    if (!item) {
      throw httpError(404, 'Content not found');
    }
    return item;
  }

  async getPublicContentBySlug(slug: string) {
    const item = await this.repository.findBySlug(slug);
    if (!item || item.status !== 'published') {
      throw httpError(404, 'Content not found');
    }
    return item;
  }

  private async resolveUniqueSlug(baseValue: string, excludeId?: string) {
    const baseSlug = slugify(baseValue) || `content-${Date.now().toString(36)}`;
    let candidate = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await this.repository.findBySlug(candidate);
      if (!existing || existing.id === excludeId) {
        return candidate;
      }

      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
    }
  }

  private async upsertImportedContent(
    draft: ImportedContentDraft,
    actorUserId: string,
    inputStatus: ContentStatus,
  ) {
    const existing = await this.repository.findBySource({
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      sourceUrl: draft.sourceUrl,
    });

    const slug = await this.resolveUniqueSlug(draft.title, existing?.id);
    const payload = {
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      content: draft.content,
      coverUrl: draft.coverUrl ?? null,
      authorName: draft.authorName ?? null,
      sourceType: draft.sourceType,
      sourceId: draft.sourceId ?? null,
      sourceUrl: draft.sourceUrl ?? null,
      status: existing?.status ?? inputStatus,
      publishedAt:
        draft.publishedAt ?? (inputStatus === 'published' ? this.capabilities.now() : null),
      importedAt: this.capabilities.now(),
      meta: draft.meta ?? {},
    };

    const item = existing
      ? await this.repository.update(existing.id, payload)
      : await this.repository.create({
          ...payload,
          createdAt: this.capabilities.now(),
          updatedAt: this.capabilities.now(),
        });

    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      eventName: existing ? 'content.updated' : 'content.created',
      properties: {
        contentId: item?.id,
        title: draft.title,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId ?? null,
      },
    });

    return item;
  }

  async upsertContent(
    contentId: string | null,
    input: {
      title: string;
      slug?: string;
      excerpt?: string;
      content: string;
      coverUrl?: string;
      authorName?: string;
      status: ContentStatus;
      sourceType: ContentSourceType;
      sourceId?: string;
      sourceUrl?: string;
      publishedAt?: string;
      meta?: Record<string, unknown>;
    },
    actorUserId: string,
  ) {
    const existing = contentId ? await this.repository.findById(contentId) : null;
    const slug = await this.resolveUniqueSlug(input.slug || input.title, existing?.id);
    const computedPublishedAt =
      input.status === 'published'
        ? input.publishedAt
          ? new Date(input.publishedAt)
          : (existing?.publishedAt ?? this.capabilities.now())
        : null;
    const excerpt = normalizeString(input.excerpt) || buildExcerpt(input.content, input.title);

    const payload = {
      slug,
      title: input.title.trim(),
      excerpt,
      content: input.content,
      coverUrl: normalizeOptionalUrl(input.coverUrl) ?? null,
      authorName: normalizeString(input.authorName) || null,
      sourceType: input.sourceType,
      sourceId: normalizeString(input.sourceId) || null,
      sourceUrl: normalizeOptionalUrl(input.sourceUrl) ?? null,
      status: input.status,
      publishedAt: computedPublishedAt,
      meta: input.meta ?? existing?.meta ?? {},
      importedAt: existing?.importedAt ?? null,
    };

    const item = existing
      ? await this.repository.update(existing.id, payload)
      : await this.repository.create({
          ...payload,
          createdAt: this.capabilities.now(),
          updatedAt: this.capabilities.now(),
        });

    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      eventName: existing ? 'content.updated' : 'content.created',
      properties: {
        contentId: item?.id,
        title: item?.title,
        status: item?.status,
        sourceType: item?.sourceType,
      },
    });

    return item;
  }

  private async requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await response.json()) as T;
    return { response, data };
  }

  async importFromWordPress(
    input: {
      siteUrl: string;
      postUrl?: string;
      postId?: string | number;
      slug?: string;
      username?: string;
      appPassword?: string;
      status: 'draft' | 'published';
    },
    actorUserId: string,
  ) {
    const derivedSiteUrl = input.postUrl
      ? (() => {
          try {
            const url = new URL(input.postUrl);
            return `${url.protocol}//${url.host}`;
          } catch {
            return '';
          }
        })()
      : '';
    const siteUrl = (input.siteUrl || derivedSiteUrl).replace(/\/+$/, '');
    if (!siteUrl) {
      throw new Error('WordPress 站点地址未配置');
    }
    const normalizedConfiguredSiteUrl = input.siteUrl.replace(/\/+$/, '');
    const auth =
      normalizedConfiguredSiteUrl &&
      derivedSiteUrl &&
      normalizedConfiguredSiteUrl === derivedSiteUrl
        ? basicAuthHeader(input.username, input.appPassword)
        : !normalizedConfiguredSiteUrl
          ? basicAuthHeader(input.username, input.appPassword)
          : undefined;
    const postId = input.postId ? String(input.postId).trim() : '';
    const explicitSlug = normalizeString(input.slug);
    const urlSlug = input.postUrl ? parseWordPressSlugFromUrl(input.postUrl) : '';
    const postUrlId = input.postUrl ? parseWordPressIdFromUrl(input.postUrl) : '';

    let requestUrl = '';
    if (postId || postUrlId) {
      requestUrl = `${siteUrl}/wp-json/wp/v2/posts/${encodeURIComponent(postId || postUrlId)}?_embed=1`;
    } else if (explicitSlug || urlSlug) {
      requestUrl = `${siteUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(explicitSlug || urlSlug)}&_embed=1`;
    }

    const { response, data } = await this.requestJson<any>(requestUrl, {
      headers: auth ? { Authorization: auth } : undefined,
    });

    if (!response.ok) {
      throw new Error(`WordPress 导入失败：${response.status} ${response.statusText}`);
    }

    const post = Array.isArray(data) ? data[0] : data;
    if (!post?.id) {
      throw new Error('没有找到对应的 WordPress 文章');
    }

    const title = stripHtml(post.title?.rendered || '') || 'Untitled';
    const contentHtml = String(post.content?.rendered || '');
    const excerpt = buildExcerpt(String(post.excerpt?.rendered || ''), title);
    const coverUrl =
      normalizeOptionalUrl(post?._embedded?.['wp:featuredmedia']?.[0]?.source_url) ||
      normalizeOptionalUrl(post?.jetpack_featured_media_url) ||
      null;
    const authorName = normalizeString(post?._embedded?.author?.[0]?.name);
    const publishedAt = post.date_gmt || post.date ? new Date(post.date_gmt || post.date) : null;

    return this.upsertImportedContent(
      {
        title,
        excerpt,
        content: contentHtml,
        coverUrl,
        authorName,
        sourceType: 'wordpress',
        sourceId: String(post.id),
        sourceUrl: normalizeOptionalUrl(post.link || input.postUrl) ?? `${siteUrl}/?p=${post.id}`,
        publishedAt,
        meta: {
          wordpress: {
            siteUrl,
            slug: post.slug ?? explicitSlug ?? urlSlug,
            status: post.status ?? null,
          },
        },
      },
      actorUserId,
      input.status,
    );
  }

  private async requestNotion(path: string, apiToken: string, init?: RequestInit) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await response.json()) as any;
    return { response, data };
  }

  private async fetchNotionBlockTree(blockId: string, apiToken: string): Promise<NotionBlock[]> {
    let hasMore = true;
    let cursor = '';
    const blocks: NotionBlock[] = [];

    while (hasMore) {
      const query = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : '?page_size=100';
      const { response, data } = await this.requestNotion(
        `/blocks/${blockId}/children${query}`,
        apiToken,
      );
      if (!response.ok) {
        throw new Error(`读取 Notion 内容失败：${response.status} ${response.statusText}`);
      }

      const results = Array.isArray(data.results) ? data.results : [];
      for (const block of results) {
        if (block.has_children) {
          block.children = await this.fetchNotionBlockTree(block.id, apiToken);
        }
        blocks.push(block);
      }

      hasMore = Boolean(data.has_more);
      cursor = data.next_cursor || '';
    }

    return blocks;
  }

  async importFromNotion(
    input: {
      apiToken: string;
      pageUrl?: string;
      pageId?: string;
      status: 'draft' | 'published';
    },
    actorUserId: string,
  ) {
    const pageId = extractNotionPageId(input);
    if (!pageId) {
      throw new Error('无效的 Notion 页面标识');
    }

    const { response, data } = await this.requestNotion(`/pages/${pageId}`, input.apiToken);
    if (!response.ok) {
      throw new Error(`Notion 导入失败：${response.status} ${response.statusText}`);
    }

    const titleProperty = Object.values(data.properties ?? {}).find(
      (property: any) => property?.type === 'title',
    ) as any;
    const title = stripHtml(renderNotionRichText(titleProperty?.title)) || 'Untitled';
    const blocks = await this.fetchNotionBlockTree(pageId, input.apiToken);
    const contentHtml = renderNotionBlocks(blocks);
    const excerpt = buildExcerpt(contentHtml, title);
    const coverUrl =
      normalizeOptionalUrl(data.cover?.external?.url) ||
      normalizeOptionalUrl(data.cover?.file?.url) ||
      null;
    const authorName = normalizeString(data.created_by?.name);
    const publishedAt = data.last_edited_time ? new Date(data.last_edited_time) : null;

    return this.upsertImportedContent(
      {
        title,
        excerpt,
        content: contentHtml,
        coverUrl,
        authorName,
        sourceType: 'notion',
        sourceId: pageId,
        sourceUrl: normalizeOptionalUrl(input.pageUrl) ?? normalizeOptionalUrl(data.url),
        publishedAt,
        meta: {
          notion: {
            pageId,
            lastEditedTime: data.last_edited_time ?? null,
          },
        },
      },
      actorUserId,
      input.status,
    );
  }

  async importFromWechat(
    input: {
      url: string;
      status: 'draft' | 'published';
    },
    actorUserId: string,
  ) {
    const response = await fetch(input.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`微信公众号文章抓取失败：${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('#activity-name').text().trim() ||
      'Untitled';
    const description =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('#meta_content').text().trim() ||
      '';
    const authorName =
      $('#js_name').text().trim() || $('meta[name="author"]').attr('content')?.trim() || '';
    const coverUrl = normalizeOptionalUrl($('meta[property="og:image"]').attr('content'));
    const contentElement = $('#js_content');

    contentElement.find('img').each((_: number, element: any) => {
      const image = $(element);
      const bestUrl = image.attr('data-src') || image.attr('src') || '';
      if (bestUrl) {
        image.attr('src', bestUrl);
      }
      image.removeAttr('data-src');
    });

    const contentHtml = contentElement.html()?.trim() || '';
    const excerpt = buildExcerpt(description || contentHtml, title);

    return this.upsertImportedContent(
      {
        title,
        excerpt,
        content: contentHtml,
        coverUrl,
        authorName,
        sourceType: 'wechat',
        sourceId: input.url,
        sourceUrl: input.url,
        publishedAt: this.capabilities.now(),
        meta: {
          wechat: {
            importedFrom: input.url,
          },
        },
      },
      actorUserId,
      input.status,
    );
  }
}
