import type { ReactNode } from "react";

export type AlertVariant = "error" | "success" | "info" | "warning";

const variantStyles: Record<AlertVariant, string> = {
  error: "bg-danger-50 text-danger-500 border-danger-500/20",
  success: "bg-success-50 text-success-700 border-success-500/20",
  info: "bg-primary-50 text-primary-700 border-primary-500/20",
  warning: "bg-warning-50 text-warning-700 border-warning-500/20",
};

interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
}

export default function Alert({ variant, children, className = "" }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`p-3 rounded-(--radius-btn) border text-sm ${variantStyles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
