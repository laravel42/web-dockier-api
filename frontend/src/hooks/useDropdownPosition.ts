import { useState, useCallback, useRef, useEffect } from "react";

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
