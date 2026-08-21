import { useEffect, useState } from "react";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";

/**
 * Hook for optimistic boolean toggle with automatic revert on API failure.
 *
 * Pattern: set state immediately → call API → revert + toast on error.
 *
 * The local state re-syncs whenever `initialValue` changes (e.g. after a
 * parent re-fetch), so the toggle stays in sync with the server.
 *
 * Usage:
 * ```ts
 * const [enabled, toggle] = useOptimisticToggle(
 *   initialValue,
 *   (next) => api.update(id, { enabled: next }),
 *   { errorFallback: "Failed to update setting" },
 * );
 * ```
 */
export function useOptimisticToggle(
  initialValue: boolean,
  applyFn: (next: boolean) => Promise<unknown>,
  options: { errorFallback?: string; onSuccess?: () => void } = {},
): [boolean, (next: boolean) => void] {
  const { errorFallback = "Failed to update", onSuccess } = options;
  const [value, setValue] = useState(initialValue);
  const toast = useToast();

  // Re-sync local state when the server-driven initial value changes
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const toggle = (next: boolean) => {
    const prev = value;
    setValue(next);
    applyFn(next)
      .then(() => onSuccess?.())
      .catch((err: unknown) => {
        setValue(prev);
        toast.error(getErrorMessage(err, errorFallback));
      });
  };

  return [value, toggle];
}
