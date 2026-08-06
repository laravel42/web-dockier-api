import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";

interface DropdownPortalProps {
  open: boolean;
  pos: { top: number; left: number; width: number } | null;
  dropdownRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
}

/**
 * Fixed-position portal wrapper for dropdown menus.
 *
 * Renders children into document.body with the correct position
 * calculated by `useDropdownPosition`. All select/combobox components
 * share this pattern — extract once, use everywhere.
 */
export default function DropdownPortal({ open, pos, dropdownRef, children, className }: DropdownPortalProps) {
  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={className ?? "bg-card border border-border rounded-(--radius-input) shadow-lg max-h-64 flex flex-col"}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
    >
      {children}
    </div>,
    document.body,
  );
}
