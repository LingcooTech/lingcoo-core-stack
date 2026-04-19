import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { DocsRepository } from './repository';

type DocSpaceType = 'product' | 'app' | 'internal';
type DocSpaceStatus = 'active' | 'hidden' | 'archived';
type DocPageStatus = 'draft' | 'published' | 'archived';

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
    return url.toString();
  } catch {
    return null;
  }
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

type DocPageNode = {
  id: string;
  parentId: string | null;
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  status: DocPageStatus;
  sortOrder: number;
  children: DocPageNode[];
};

export class DocsService {
  private readonly repository: DocsRepository;

  constructor(private readonly db: DbExecutor) {
    this.repository = new DocsRepository(db);
  }

  private async resolveUniqueSpaceSlug(baseValue: string, excludeId?: string) {
    const baseSlug = slugify(baseValue) || `space-${Date.now().toString(36)}`;
    let candidate = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await this.repository.findSpaceBySlug(candidate);
      if (!existing || existing.id === excludeId) {
        return candidate;
      }

      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
    }
  }

  private async resolveUniquePagePath(
    spaceId: string,
    slug: string,
    parentPath: string,
    excludeId?: string,
  ) {
    const baseSlug = slugify(slug) || `page-${Date.now().toString(36)}`;
    let candidateSlug = baseSlug;
    let suffix = 1;

    while (true) {
      const candidatePath = parentPath ? `${parentPath}/${candidateSlug}` : candidateSlug;
      const existing = await this.repository.findPageByPath(spaceId, candidatePath);
      if (!existing || existing.id === excludeId) {
        return { slug: candidateSlug, path: candidatePath };
      }

      suffix += 1;
      candidateSlug = `${baseSlug}-${suffix}`;
    }
  }

  private buildPageTree(pages: Array<{
    id: string;
    parentId: string | null;
    slug: string;
    path: string;
    title: string;
    summary: string | null;
    status: DocPageStatus;
    sortOrder: number;
  }>) {
    const nodeMap = new Map<string, DocPageNode>();

    for (const page of pages) {
      nodeMap.set(page.id, {
        ...page,
        children: [],
      });
    }

    const roots: DocPageNode[] = [];
    for (const page of pages) {
      const node = nodeMap.get(page.id)!;
      if (page.parentId && nodeMap.has(page.parentId)) {
        nodeMap.get(page.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortNodes = (nodes: DocPageNode[]) => {
      nodes.sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
      for (const node of nodes) {
        sortNodes(node.children);
      }
    };

    sortNodes(roots);
    return roots;
  }

  private flattenTree(nodes: DocPageNode[]) {
    const output: DocPageNode[] = [];

    const visit = (items: DocPageNode[]) => {
      for (const item of items) {
        output.push(item);
        visit(item.children);
      }
    };

    visit(nodes);
    return output;
  }

  async listAdminSpaces(query?: { search?: string }) {
    const spaces = await this.repository.listSpaces(query);
    const enriched = await Promise.all(
      spaces.map(async (space) => ({
        ...space,
        pageCount: await this.repository.countPagesBySpace(space.id),
      })),
    );

    return { items: enriched };
  }

  async getAdminSpace(spaceId: string) {
    const space = await this.repository.findSpaceById(spaceId);
    if (!space) {
      throw httpError(404, 'Doc space not found');
    }

    const pages = await this.repository.listPagesBySpace(space.id);
    return {
      space,
      pages,
      tree: this.buildPageTree(
        pages.map((page) => ({
          id: page.id,
          parentId: page.parentId ?? null,
          slug: page.slug,
          path: page.path,
          title: page.title,
          summary: page.summary ?? null,
          status: page.status,
          sortOrder: page.sortOrder,
        })),
      ),
    };
  }

  async upsertSpace(
    spaceId: string | null,
    input: {
      slug: string;
      title: string;
      description?: string;
      iconUrl?: string;
      type: DocSpaceType;
      appId?: string;
      sortOrder: number;
      status: DocSpaceStatus;
      meta?: Record<string, unknown>;
    },
  ) {
    const existing = spaceId ? await this.repository.findSpaceById(spaceId) : null;
    const slug = await this.resolveUniqueSpaceSlug(input.slug || input.title, existing?.id);

    const payload = {
      slug,
      title: input.title.trim(),
      description: normalizeString(input.description) || null,
      iconUrl: normalizeOptionalUrl(input.iconUrl) ?? null,
      type: input.type,
      appId: normalizeString(input.appId) || null,
      sortOrder: input.sortOrder,
      status: input.status,
      meta: input.meta ?? existing?.meta ?? {},
    };

    return existing
      ? this.repository.updateSpace(existing.id, payload)
      : this.repository.createSpace({ ...payload, createdAt: new Date(), updatedAt: new Date() });
  }

  async getPageById(pageId: string) {
    const page = await this.repository.findPageById(pageId);
    if (!page) {
      throw httpError(404, 'Doc page not found');
    }
    return page;
  }

  async upsertPage(
    pageId: string | null,
    input: {
      spaceId: string;
      parentId?: string;
      slug: string;
      title: string;
      summary?: string;
      content: string;
      sortOrder: number;
      status: DocPageStatus;
      publishedAt?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const existing = pageId ? await this.repository.findPageById(pageId) : null;
    const parentId = normalizeString(input.parentId) || null;
    const parent = parentId ? await this.repository.findPageById(parentId) : null;
    if (parentId && !parent) {
      throw httpError(422, 'Parent page not found');
    }
    if (parent && parent.spaceId !== input.spaceId) {
      throw httpError(422, 'Parent page must belong to the same doc space');
    }

    const resolved = await this.resolveUniquePagePath(
      input.spaceId,
      input.slug || input.title,
      parent?.path ?? '',
      existing?.id,
    );

    const payload = {
      spaceId: input.spaceId,
      parentId,
      slug: resolved.slug,
      path: resolved.path,
      title: input.title.trim(),
      summary: normalizeString(input.summary) || null,
      content: input.content,
      sortOrder: input.sortOrder,
      status: input.status,
      publishedAt:
        input.status === 'published'
          ? input.publishedAt
            ? new Date(input.publishedAt)
            : existing?.publishedAt ?? new Date()
          : null,
      meta: input.meta ?? existing?.meta ?? {},
    };

    return existing
      ? this.repository.updatePage(existing.id, payload)
      : this.repository.createPage({ ...payload, createdAt: new Date(), updatedAt: new Date() });
  }

  async listPublicSpaces() {
    const spaces = await this.repository.listPublicSpaces();
    const result = await Promise.all(
      spaces.map(async (space) => ({
        ...space,
        pageCount: (await this.repository.listPagesBySpace(space.id)).filter((page) => page.status === 'published').length,
      })),
    );

    return { items: result };
  }

  async getPublicSpace(spaceSlug: string) {
    const space = await this.repository.findSpaceBySlug(spaceSlug);
    if (!space || space.status !== 'active') {
      throw httpError(404, 'Doc space not found');
    }

    const pages = (await this.repository.listPagesBySpace(space.id)).filter((page) => page.status === 'published');
    const tree = this.buildPageTree(
      pages.map((page) => ({
        id: page.id,
        parentId: page.parentId ?? null,
        slug: page.slug,
        path: page.path,
        title: page.title,
        summary: page.summary ?? null,
        status: page.status,
        sortOrder: page.sortOrder,
      })),
    );
    const ordered = this.flattenTree(tree);

    return {
      space,
      tree,
      defaultPath: ordered[0]?.path ?? null,
    };
  }

  async getPublicPage(spaceSlug: string, path?: string) {
    const { space, tree, defaultPath } = await this.getPublicSpace(spaceSlug);
    const resolvedPath = normalizeString(path) || defaultPath;
    if (!resolvedPath) {
      throw httpError(404, 'Doc page not found');
    }

    const page = await this.repository.findPageByPath(space.id, resolvedPath);
    if (!page || page.status !== 'published') {
      throw httpError(404, 'Doc page not found');
    }

    const ordered = this.flattenTree(tree);
    const currentIndex = ordered.findIndex((item) => item.path === page.path);

    return {
      space,
      tree,
      page,
      previousPage: currentIndex > 0 ? ordered[currentIndex - 1] : null,
      nextPage: currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : null,
    };
  }
}
