import { useState, useCallback } from "react";

export type ViewMode = "cards" | "table";

/**
 * Persists a cards/table view preference in localStorage.
 *
 * Used by Projects, Deployments, and Security Scans list pages
 * to remember the user's layout choice across sessions.
 *
 * @param storageKey - localStorage key (e.g. "projects-view")
 * @param defaultMode - initial mode if nothing is stored (default: "cards")
 */
export function useViewMode(storageKey: string, defaultMode: ViewMode = "cards") {
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(storageKey) as ViewMode) || defaultMode,
  );

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(storageKey, mode);
  }, [storageKey]);

  return { viewMode, changeViewMode } as const;
}
