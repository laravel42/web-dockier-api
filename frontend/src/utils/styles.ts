// ── Buttons ──────────────────────────────────────────────────────
export const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
export const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
export const btnDanger = "text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors";

// ── Inputs ───────────────────────────────────────────────────────
export const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";

// ── Cards ────────────────────────────────────────────────────────
export const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

// ── Status colors ────────────────────────────────────────────────

/** Dot-style status colors (solid background, no text color) — for small status indicators */
export const statusDotColors: Record<string, string> = {
  success: "bg-success-500",
  failed: "bg-danger-500",
  building: "bg-warning-500",
  deploying: "bg-primary-500",
  pending: "bg-secondary-400",
  destroyed: "bg-secondary-400",
  completed: "bg-success-500",
  running: "bg-primary-500",
};

/** Badge-style status colors (tinted background + text) — for status labels */
export const statusBadgeColors: Record<string, string> = {
  success: "bg-success-500/10 text-success-500",
  failed: "bg-danger-500/10 text-danger-500",
  building: "bg-warning-500/10 text-warning-500",
  deploying: "bg-primary-500/10 text-primary-500",
  pending: "bg-secondary-100 text-text-muted",
  destroyed: "bg-secondary-100 text-text-muted",
  completed: "bg-success-500/10 text-success-500",
  running: "bg-primary-500/10 text-primary-500",
};

/** Strategy display labels */
export const strategyLabels: Record<string, string> = {
  vps: "VPS",
  managed: "ECS Fargate",
};
