// ── Typography (dockier.dev — compact app scale) ─────────────────
/** Page h1 */
export const typePageTitle =
  "font-display text-xl font-semibold tracking-tight leading-tight text-foreground";
/** Subtitle under page title */
export const typePageDesc = "text-ui text-muted-foreground leading-snug";
/** In-page section heading */
export const typeSectionHeading = "text-sm font-semibold leading-snug text-text";
/** Panel / card section title */
export const typePanelTitle = "text-ui font-semibold leading-snug text-text";
/** Secondary line under panel title */
export const typePanelDesc = "text-ui-sm text-text-muted leading-snug";
/** KPI / stat label */
export const typeStatLabel =
  "text-xs font-medium uppercase tracking-wider leading-none text-text-muted";
/** Large metric value */
export const typeStatValue = "font-display text-2xl font-semibold tabular-nums leading-tight text-text";
/** Medium metric value (dense grids) */
export const typeStatValueSm = "font-display text-xl font-semibold tabular-nums leading-tight text-text";
/** KPI delta / footnote */
export const typeStatDelta = "text-ui-sm text-text-muted";
/** Card / list item title */
export const typeCardTitle = "text-ui font-semibold leading-snug text-text";
/** Card meta, timestamps */
export const typeCardMeta = "text-ui-sm text-text-muted";
/** Card date/time — matches DeployCard footer timestamps */
export const typeCardDateCls = "text-xs text-text-muted";
/** Default UI body copy */
export const typeBody = "text-ui text-text leading-snug";
/** Muted body copy */
export const typeBodyMuted = "text-ui text-text-muted leading-snug";
/** Fine print, table secondary cells */
export const typeCaption = "text-ui-sm text-text-muted";
/** Overline / category label */
export const typeOverline = "text-xs font-medium uppercase tracking-wider text-text-muted";

/** Marketing / empty-state — gold overline pill */
export const overlinePillCls =
  "inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary";

/** Marketing hero headline */
export const marketingHeroTitle =
  "font-display text-3xl sm:text-4xl xl:text-5xl font-semibold tracking-tight text-foreground text-center text-balance leading-[1.15]";

/** Marketing hero body */
export const marketingHeroDesc =
  "mt-3 max-w-xl mx-auto text-center text-ui text-text-muted text-balance leading-relaxed";

/** Marketing section heading */
export const marketingSectionTitle =
  "font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground text-center text-balance";

/** Marketing section subcopy */
export const marketingSectionDesc =
  "mt-2 max-w-lg mx-auto text-center text-ui text-text-muted leading-relaxed";

// ── Surfaces ─────────────────────────────────────────────────────
export const panelCls =
  "rounded-xl border border-border/50 bg-card/40 backdrop-blur overflow-hidden";

export const statCardCls = `${panelCls} p-4`;

/** Feature card on marketing surfaces */
export const featureCardCls = `${panelCls} p-4 flex flex-col gap-2.5`;

/** Selectable option card — idle */
export const choiceCardIdleCls =
  "border-border bg-card text-foreground hover:border-primary/30 hover:bg-card/60";

/** Selectable option card — selected (dark/light safe) */
export const choiceCardSelectedCls =
  "border-primary/50 bg-primary/10 text-foreground ring-2 ring-primary/25";

/** Icon tile inside a choice card */
export const choiceCardIconIdleCls = "bg-muted text-muted-foreground";
export const choiceCardIconSelectedCls = "bg-primary/15 text-primary";

// ── Buttons ──────────────────────────────────────────────────────
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 text-ui font-medium tracking-tight rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 text-ui font-medium tracking-tight rounded-md bg-secondary-100 text-text hover:bg-secondary-200 transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnOutline =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 text-ui font-medium tracking-tight rounded-md border border-border bg-background shadow-sm hover:bg-card/60 transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 text-ui font-medium tracking-tight rounded-md text-text-muted hover:bg-card/60 hover:text-text transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnDanger = "text-ui text-danger-500 hover:text-danger-700 font-medium transition-colors";

export const btnLink =
  "inline-flex items-center gap-1 text-ui font-medium text-primary hover:text-primary/80 transition-colors";

/** Form field labels */
export const labelCls = "mb-1 block text-xs font-medium leading-none text-muted-foreground";

/** Auth */
export const btnPrimaryAuth =
  "h-10 px-4 w-full text-sm font-semibold tracking-tight rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none";

export const btnSecondaryAuth =
  "h-10 px-4 w-full text-sm font-semibold tracking-tight rounded-md border border-border bg-transparent hover:bg-card/60 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none";

export const btnAccent = btnPrimary;

/** Sidebar nav link */
export const navLinkCls =
  "flex items-center gap-2 rounded-md px-3 py-1.5 text-[14px] font-medium leading-snug transition-colors";
/** Sidebar nav link — active */
export const navLinkActiveCls = "bg-primary/10 text-foreground";
/** Sidebar nav link — idle hover */
export const navLinkIdleCls = "text-muted-foreground hover:bg-card hover:text-foreground";

/** @deprecated Prefer `<Input />` from `@/components/ui/input` or field helpers in `@/components/ui/fields` */
export const inputCls =
  "w-full h-9 px-3 rounded-md border border-border bg-background text-ui text-text outline-none placeholder:text-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30";
export const cardCls = panelCls;
export const cardInteractiveCls = `${panelCls} hover:bg-card/60 transition-colors cursor-pointer`;

/** Settings tab card — static */
export const settingsCardCls =
  "bg-card border border-border rounded-card p-4 transition-all shadow-(--shadow-card)";

/** Settings tab card — clickable with border hover */
export const settingsCardInteractiveCls =
  `${settingsCardCls} hover:border-primary-500/30 cursor-pointer`;

/** Settings tab responsive card grid */
export const settingsCardGridCls =
  "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3";

/** Table wrapper — list pages */
export const tablePanelCls = "overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur";

/** Table header row */
export const tableHeadCls = "bg-card/60 text-left text-text-muted";

/** Table cells — use with `.table-compact` on `<table>` */
export const tableCellCls = "text-text";
export const tableCellMutedCls = "text-text-muted";

/** Small metadata chip (branch, source, etc.) */
export const chipCls =
  "inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/40 px-1.5 py-0.5 text-ui-sm text-text-muted shrink-0";

/** Floating detail sidebar — panel header row */
export const sidebarPanelHeadCls =
  "border-b border-border/50 bg-card/60 px-3 py-1.5";

export const sidebarPanelHeadTitleCls =
  "text-xs font-semibold uppercase tracking-wider text-text-muted";

export function sidebarHistoryItemCls(active: boolean): string {
  return active
    ? "w-full text-left bg-primary/10 transition-colors"
    : "w-full text-left transition-colors hover:bg-card/60";
}

export function sidebarHistoryLabelCls(active: boolean, size: "sm" | "xs" = "sm"): string {
  const sizeCls = size === "xs" ? "text-ui-sm" : "text-ui";
  return `${sizeCls} font-medium truncate leading-snug ${active ? "text-foreground" : "text-text"}`;
}

// ── Status colors ────────────────────────────────────────────────
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

export const strategyLabels: Record<string, string> = {
  vps: "VPS",
  managed: "ECS Fargate",
};

export function getStatusBadgeClass(status: string): string {
  return statusBadgeColors[status] || statusBadgeColors.pending;
}

export function getStatusDotClass(status: string): string {
  return statusDotColors[status] || statusDotColors.pending;
}
