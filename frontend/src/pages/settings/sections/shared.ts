/** Severity dot color mapping — shared across all rule panels. */
const SEVERITY_DOT_CLS: Record<string, string> = {
  error: "bg-danger-500",
  high: "bg-danger-500",
  blocker: "bg-danger-500",
  critical: "bg-orange-500",
  warning: "bg-warning-500",
  medium: "bg-warning-500",
  major: "bg-warning-500",
  minor: "bg-primary-500",
  info: "bg-secondary-400",
};

export function severityDotCls(severity: string): string {
  return SEVERITY_DOT_CLS[severity.toLowerCase()] || "bg-primary-500";
}
