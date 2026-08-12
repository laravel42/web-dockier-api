import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "default" | "lg" | "xl";
  compact?: boolean;
  /** When false, modal body does not scroll — content must manage its own overflow. */
  bodyScroll?: boolean;
}

/**
 * Selector for elements that can receive focus within the modal.
 * Covers interactive elements per WAI-ARIA modal dialog pattern.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function Modal({ open, onClose, title, children, size = "default", bodyScroll = true }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Focus trap: move focus into the dialog on open, trap Tab cycling
  useEffect(() => {
    if (!open || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus to the first focusable element inside the dialog
    const focusFirst = () => {
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) focusable[0].focus();
      else dialog.focus();
    };
    // Small delay allows the portal to mount before focus shift
    requestAnimationFrame(focusFirst);

    // Trap Tab key within the dialog
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);

    return () => {
      document.removeEventListener("keydown", handleTab);
      // Restore focus to the previously focused element when modal closes
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const widthCls = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className={`${widthCls} w-full pointer-events-auto relative bg-card rounded-card shadow-(--shadow-overlay) border border-border/50 p-5 flex flex-col`}
          style={{ maxHeight: "85vh" }}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5 shrink-0">
            <h2 id="modal-title" className="text-base font-display font-semibold text-text">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={`flex-1 min-h-0 ${bodyScroll ? "overflow-y-auto" : "flex flex-col overflow-hidden"}`}>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
