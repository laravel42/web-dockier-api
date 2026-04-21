import { useEffect } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

export interface ToastData {
  id: number;
  type: "success" | "error";
  message: string;
}

export interface ToastProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
        isSuccess
          ? "border-green-800 bg-green-950/90 text-green-300"
          : "border-red-800 bg-red-950/90 text-red-300"
      }`}
    >
      {isSuccess ? (
        <CheckCircle className="h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 transition-colors hover:bg-white/10"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
