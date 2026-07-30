import { useState, useEffect, useCallback, useRef } from "react";
import { getErrorMessage } from "../utils/errors";
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
 * Handles: loading/error state, pagination (offset-based), debounced search,
 * and re-fetching when search changes. Provides `goToPage`, `handleSearch`,
 * and `reload` for consumer control.
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

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, limit: pageSize, offset: 0 });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher({ limit: pageSize, offset, search: debouncedSearch });
      setItems(result.items);
      setPagination(result.pagination);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- debouncedSearch is the trigger
  }, [debouncedSearch, pageSize]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goToPage = useCallback((page: number) => {
    const newOffset = (page - 1) * pageSize;
    fetchData(newOffset);
  }, [fetchData, pageSize]);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(query);
    }, debounceMs);
  }, [debounceMs]);

  const reload = useCallback(() => {
    fetchData(pagination.offset);
  }, [fetchData, pagination.offset]);

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
