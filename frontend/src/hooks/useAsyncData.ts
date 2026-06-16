import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../utils/errors";

interface UseAsyncDataOptions {
  /** When false, skip the initial fetch. Default true. */
  enabled?: boolean;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
  options: UseAsyncDataOptions = {},
) {
  const { enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
      return result;
    } catch (err) {
      setError(getErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { data, loading, error, reload, setData };
}
