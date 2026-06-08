import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "default" | "lg" | "xl";
  compact?: boolean;
}

export default function Modal({ open, onClose, title, children, size = "default" }: ModalProps) {
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

  if (!open) return null;

  const widthCls = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-9999" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`${widthCls} w-full pointer-events-auto relative bg-card rounded-card shadow-(--shadow-card-hover) border border-border/50 p-6 flex flex-col`}
          style={{ maxHeight: "85vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5 shrink-0">
            <h2 className="text-base font-display font-semibold text-text">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
