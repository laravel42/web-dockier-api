import { createContext } from "react";

export type ToastVariant = "error" | "success" | "info";

export interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
}

export interface ToastContextValue {
  toast: ToastApi;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
