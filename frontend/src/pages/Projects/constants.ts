export const inputCls =
  "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";

export const btnPrimary =
  "h-10 px-5 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors shadow-sm";

export const statusColors: Record<string, string> = {
  success: "bg-success-500",
  failed: "bg-danger-500",
  building: "bg-warning-500",
  deploying: "bg-primary-500",
  pending: "bg-secondary-400",
};
