import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../utils/errors";

interface UseAsyncDataOptions {
  /** When false, skip the initial fetch. Default true. */
  enabled?: boolean;
}

/**
 * Generic data-fetching hook with loading/error state management.
 *
 * Fetches data on mount (or when `enabled` becomes true) and exposes
 * a `reload()` function for manual re-fetching. Automatically extracts
 * user-friendly error messages via `getErrorMessage()`.
 *
 * Stale requests are automatically discarded when the component unmounts
 * or when deps change before a previous fetch completes.
 *
 * @param fetcher - Async function that returns the data
 * @param deps - Dependency array that triggers re-fetching when values change
 * @param options - Configuration (e.g., `enabled` to defer initial fetch)
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
  options: UseAsyncDataOptions = {},
) {
  const { enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(0);

  const reload = useCallback(async () => {
    const id = ++activeRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (id !== activeRef.current) return null; // stale
      setData(result);
      return result;
    } catch (err) {
      if (id !== activeRef.current) return null; // stale
      setError(getErrorMessage(err));
      return null;
    } finally {
      if (id === activeRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps);

  useEffect(() => {
    if (enabled) reload();
    // Increment the counter to invalidate any in-flight fetch on unmount or dep change
    return () => { activeRef.current += 1; };
  }, [enabled, reload]);

  return { data, loading, error, reload, setData };
}
