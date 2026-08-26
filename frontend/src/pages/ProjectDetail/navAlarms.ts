import type { Dependency } from "@/components/DeployWizard";
import type { Scan } from "@/types/scan";
import type { Deployment } from "@/types";

/**
 * The nav rules from docs/delivery/project-detail-ia.md, as pure functions.
 *
 * They live outside the component so the decisions are testable without mounting
 * the entire project surface — and so a test cannot pass against a copy of the
 * rules while the component does something else.
 */

export type AlarmTone = "danger" | "caution" | "warning";
export interface Alarm {
  count: number;
  tone: AlarmTone;
  /** Screen-reader text: a bare number is colour-coded shorthand. */
  label: string;
}

/** Tabs describing a running server. Meaningless before the first deploy. */
export const RUNTIME_TABS = ["processes", "network", "domains", "observe"] as const;

/**
 * Has this project ever run? A later failure does not un-ship it — the server
 * exists and can still be inspected, so any past success counts.
 */
export function hasShipped(deploys: readonly Deployment[] | undefined): boolean {
  return (deploys ?? []).some((d) => d.status === "success");
}

export function isRuntimeTabVisible(key: string, deploys: readonly Deployment[] | undefined): boolean {
  return !(RUNTIME_TABS as readonly string[]).includes(key) || hasShipped(deploys);
}

/**
 * Error findings from the latest scan — never `totalFindings` or infos.
 * Warnings alone do not badge the Security tab. Returns null when there are
 * no errors, so a clean (or warnings-only) scan shows no badge rather than a zero.
 */
export function securityAlarm(scans: readonly Scan[] | undefined): Alarm | null {
  const summary = scans?.[0]?.summary;
  if (!summary) return null;
  const count = summary.errors;
  if (count <= 0) return null;
  return {
    count,
    tone: "danger",
    label: `${count} error${count === 1 ? "" : "s"} needing attention`,
  };
}

/** Sensitive fields detected in the schema. */
export function sensitiveDataAlarm(fields: readonly unknown[] | null | undefined): Alarm | null {
  const count = fields?.length ?? 0;
  if (count <= 0) return null;
  return {
    count,
    tone: "caution",
    label: `${count} sensitive field${count === 1 ? "" : "s"} detected`,
  };
}

/** Dependencies that are vulnerable or off `active` — not the dependency total. */
export function dependencyAlarm(deps: readonly Dependency[] | undefined): Alarm | null {
  const count = (deps ?? []).filter(
    (d) => d.vulnerabilities.length > 0 || (d.status && d.status !== "active"),
  ).length;
  if (count <= 0) return null;
  return {
    count,
    tone: "warning",
    label: `${count} dependenc${count === 1 ? "y" : "ies"} vulnerable or outdated`,
  };
}
