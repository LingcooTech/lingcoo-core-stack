import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableState {
  page: number;
  pageSize: number;
  search: string;
  sort: TableSort | null;
  filters: Record<string, string[]>;
}

export interface TableStateActions {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearch: (value: string) => void;
  setSort: (sort: TableSort | null) => void;
  /** 切换某列排序：asc → desc → 取消，与现有 useTableSort 行为一致 */
  toggleSort: (key: string) => void;
  setFilter: (id: string, values: string[] | null) => void;
  clearFilters: () => void;
  reset: () => void;
}

export interface UseTableStateOptions {
  defaultPageSize?: number;
  /** URL search-params 前缀，避免同一页有多个表格时冲突 */
  prefix?: string;
  /** 已知 filter id 列表；用于 reset/clear 时清理对应 search param */
  knownFilters?: string[];
}

const DEFAULT_PAGE_SIZE = 20;

function buildKey(prefix: string | undefined, name: string) {
  return prefix ? `${prefix}.${name}` : name;
}

function parseSort(raw: string | null): TableSort | null {
  if (!raw) return null;
  const [key, direction] = raw.split(':');
  if (!key || (direction !== 'asc' && direction !== 'desc')) return null;
  return { key, direction };
}

/**
 * 表格状态 ↔ URL search-params 双向同步：
 *   ?page=2&pageSize=20&search=foo&sort=email:asc&status=active,pending
 *
 * 多表格共存：用 prefix='users' → ?users.page=2&users.sort=...
 *
 * 行为：所有变更都用 setSearchParams(..., { replace: true })，不进
 * 历史栈；只有 page=1 / pageSize=default / 空值会从 URL 中清掉，
 * 保持 URL 干净。
 */
export function useTableState(options?: UseTableStateOptions): TableState & TableStateActions {
  const { defaultPageSize = DEFAULT_PAGE_SIZE, prefix, knownFilters = [] } = options ?? {};
  const [searchParams, setSearchParams] = useSearchParams();

  // 派生 state
  const state: TableState = useMemo(() => {
    const page = Number.parseInt(searchParams.get(buildKey(prefix, 'page')) ?? '', 10);
    const pageSize = Number.parseInt(searchParams.get(buildKey(prefix, 'pageSize')) ?? '', 10);
    const search = searchParams.get(buildKey(prefix, 'search')) ?? '';
    const sort = parseSort(searchParams.get(buildKey(prefix, 'sort')));

    const filters: Record<string, string[]> = {};
    for (const id of knownFilters) {
      const raw = searchParams.get(buildKey(prefix, id));
      if (raw) filters[id] = raw.split(',').filter(Boolean);
    }

    return {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : defaultPageSize,
      search,
      sort,
      filters,
    };
  }, [searchParams, prefix, defaultPageSize, knownFilters]);

  const updateParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => {
      updateParams((next) => {
        const key = buildKey(prefix, 'page');
        if (page <= 1) next.delete(key);
        else next.set(key, String(page));
      });
    },
    [prefix, updateParams],
  );

  const setPageSize = useCallback(
    (size: number) => {
      updateParams((next) => {
        const key = buildKey(prefix, 'pageSize');
        if (size === defaultPageSize) next.delete(key);
        else next.set(key, String(size));
        // 改 pageSize 时回到第一页
        next.delete(buildKey(prefix, 'page'));
      });
    },
    [prefix, defaultPageSize, updateParams],
  );

  const setSearch = useCallback(
    (value: string) => {
      updateParams((next) => {
        const key = buildKey(prefix, 'search');
        if (!value) next.delete(key);
        else next.set(key, value);
        next.delete(buildKey(prefix, 'page'));
      });
    },
    [prefix, updateParams],
  );

  const setSort = useCallback(
    (sort: TableSort | null) => {
      updateParams((next) => {
        const key = buildKey(prefix, 'sort');
        if (!sort) next.delete(key);
        else next.set(key, `${sort.key}:${sort.direction}`);
      });
    },
    [prefix, updateParams],
  );

  const toggleSort = useCallback(
    (key: string) => {
      const current = state.sort;
      let nextSort: TableSort | null;
      if (!current || current.key !== key) nextSort = { key, direction: 'asc' };
      else if (current.direction === 'asc') nextSort = { key, direction: 'desc' };
      else nextSort = null;
      setSort(nextSort);
    },
    [state.sort, setSort],
  );

  const setFilter = useCallback(
    (id: string, values: string[] | null) => {
      updateParams((next) => {
        const key = buildKey(prefix, id);
        if (!values || values.length === 0) next.delete(key);
        else next.set(key, values.join(','));
        next.delete(buildKey(prefix, 'page'));
      });
    },
    [prefix, updateParams],
  );

  const clearFilters = useCallback(() => {
    updateParams((next) => {
      for (const id of knownFilters) next.delete(buildKey(prefix, id));
      next.delete(buildKey(prefix, 'page'));
    });
  }, [prefix, knownFilters, updateParams]);

  const reset = useCallback(() => {
    updateParams((next) => {
      next.delete(buildKey(prefix, 'page'));
      next.delete(buildKey(prefix, 'pageSize'));
      next.delete(buildKey(prefix, 'search'));
      next.delete(buildKey(prefix, 'sort'));
      for (const id of knownFilters) next.delete(buildKey(prefix, id));
    });
  }, [prefix, knownFilters, updateParams]);

  return {
    ...state,
    setPage,
    setPageSize,
    setSearch,
    setSort,
    toggleSort,
    setFilter,
    clearFilters,
    reset,
  };
}
