import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "default" | "lg" | "xl";
  compact?: boolean;
}

export default function Modal({ open, onClose, title, children, size = "default" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  if (!open) return null;

  const widthCls = size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <dialog
      ref={dialogRef}
      className={`backdrop:bg-black/50 backdrop-blur-sm bg-transparent p-0 m-auto rounded-[var(--radius-card)] outline-none ${widthCls} w-full`}
      style={{ maxHeight: "90vh", overflow: "visible" }}
      onClick={(e) => { e.stopPropagation(); }}
      onCancel={(e) => { e.preventDefault(); }}
    >
      <div className="relative bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card-hover)] border border-border/50 p-6 pb-16">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-display font-semibold text-text">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </dialog>
  );
}
