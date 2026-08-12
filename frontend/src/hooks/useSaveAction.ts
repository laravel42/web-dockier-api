import { useCallback, useRef, useState } from "react";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";

interface UseSaveActionOptions {
  /** Duration in ms to show the "saved" indicator. Default: 2000. */
  savedDuration?: number;
  /** Fallback error message. */
  errorFallback?: string;
  /** Called after a successful save. */
  onSuccess?: () => void;
}

/**
 * Generic hook for the common "save → show spinner → flash success" pattern.
 *
 * Encapsulates:
 * - `saving` loading state
 * - `saved` transient success flag (auto-resets after `savedDuration` ms)
 * - Toast-based error reporting on failure
 *
 * Usage:
 * ```ts
 * const { saving, saved, save } = useSaveAction(
 *   () => projectsApi.update(id, payload),
 *   { errorFallback: "Failed to save note" },
 * );
 * ```
 */
export function useSaveAction<T = void>(
  saveFn: () => Promise<T>,
  options: UseSaveActionOptions = {},
) {
  const { savedDuration = 2000, errorFallback = "Failed to save", onSuccess } = options;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = useCallback(async (): Promise<T | null> => {
    setSaving(true);
    try {
      const result = await saveFn();
      setSaved(true);
      // Clear any previous timer to avoid stale resets
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), savedDuration);
      onSuccess?.();
      return result;
    } catch (err) {
      toast.error(getErrorMessage(err, errorFallback));
      return null;
    } finally {
      setSaving(false);
    }
   
  }, [saveFn, savedDuration, errorFallback, onSuccess, toast]);

  return { saving, saved, save };
}
