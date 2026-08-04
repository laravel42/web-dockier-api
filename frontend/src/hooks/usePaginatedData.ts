import { useState, useCallback, useRef } from "react";
import { useAsyncData } from "./useAsyncData";
import type { PaginationMeta } from "../types";

export type { PaginationMeta };

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface UsePaginatedDataOptions {
  /** Items per page. Default: 20 */
  pageSize?: number;
  /** Debounce delay for search in ms. Default: 300 */
  debounceMs?: number;
}

/**
 * Generic hook for paginated, searchable data fetching.
 *
 * Composes `useAsyncData` for the fetch lifecycle (loading, error, stale-request
 * cancellation) and adds pagination state + debounced search on top.
 *
 * @param fetcher - Async function that receives `{ limit, offset, search }` and returns paginated data
 * @param options - Configuration (pageSize, debounceMs)
 *
 * @example
 * ```ts
 * const { items, loading, error, pagination, goToPage, search, handleSearch, reload } =
 *   usePaginatedData(
 *     ({ limit, offset, search }) =>
 *       projectsApi.list({ limit, offset, search }).then(r => ({
 *         items: r.projects,
 *         pagination: r.pagination,
 *       })),
 *     { pageSize: 50 },
 *   );
 * ```
 */
export function usePaginatedData<T>(
  fetcher: (params: { limit: number; offset: number; search: string }) => Promise<PaginatedResponse<T>>,
  options: UsePaginatedDataOptions = {},
) {
  const { pageSize = 20, debounceMs = 300 } = options;

  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useAsyncData handles loading, error, stale-request cancellation.
  // Re-fetches automatically when offset or debouncedSearch changes.
  const { data, loading, error, reload } = useAsyncData(
    () => fetcher({ limit: pageSize, offset, search: debouncedSearch }),
    [pageSize, offset, debouncedSearch],
  );

  const items = data?.items ?? [];
  const pagination: PaginationMeta = data?.pagination ?? { total: 0, limit: pageSize, offset };

  const goToPage = useCallback((page: number) => {
    setOffset((page - 1) * pageSize);
  }, [pageSize]);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(query);
      setOffset(0); // Reset to first page on new search
    }, debounceMs);
  }, [debounceMs]);

  return {
    items,
    loading,
    error,
    pagination,
    search,
    goToPage,
    handleSearch,
    reload,
  };
}
