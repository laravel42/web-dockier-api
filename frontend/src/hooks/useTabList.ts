import { useAsyncData } from "./useAsyncData";

/** Standard list fetch for settings tabs: loading, error, reload. */
export function useTabList<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
) {
  return useAsyncData(fetcher, deps);
}
