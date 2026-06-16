import { useContext } from "react";
import { ToastContext, type ToastApi } from "./toast-context";

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx.toast;
};

/** Safe toast access for modules outside React (e.g. hooks) — no-op if provider missing. */
export const useToastOptional = (): ToastApi => {
  const ctx = useContext(ToastContext);
  return (
    ctx?.toast ?? {
      error: () => {},
      success: () => {},
      info: () => {},
    }
  );
};
