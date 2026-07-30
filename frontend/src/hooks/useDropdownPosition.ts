import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Calculates and tracks the absolute position of a dropdown menu
 * relative to its trigger button. Recalculates on scroll and resize.
 *
 * @returns triggerRef — attach to the button that opens the dropdown
 * @returns pos — absolute { top, left, width } for the dropdown, or null when closed
 * @returns updatePos — call when the dropdown opens to calculate initial position
 * @returns clearPos — call when the dropdown closes
 */
export function useDropdownPosition() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  // Recalculate on scroll/resize
  useEffect(() => {
    if (!pos) return;
    const handler = () => updatePos();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [pos, updatePos]);

  const clearPos = useCallback(() => setPos(null), []);

  return { triggerRef, pos, updatePos, clearPos };
}
