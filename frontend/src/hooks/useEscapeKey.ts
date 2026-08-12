import { useEffect } from "react";

/**
 * Close a transient surface (menu, popover, picker) with Escape.
 *
 * Exists because several dropdowns shipped with only an invisible click-catcher
 * backdrop to dismiss them — which leaves a keyboard user with no way out at all.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
