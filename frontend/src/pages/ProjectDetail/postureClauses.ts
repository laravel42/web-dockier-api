import { timeAgo } from "@/utils/timeAgo";
import { strategyLabels } from "@/utils/styles";
import type { Deployment, Project } from "@/types";
import type { Scan } from "@/types/scan";

/**
 * Three clauses beneath the project title: what shipped, what is wrong, what is
 * running. Decided in docs/delivery/project-detail-ia.md.
 *
 * The rule that shapes every branch below: **it degrades honestly.** A failed
 * fetch says so. It never falls back to "Never deployed" or "No critical
 * findings", because asserting safety from an error is the single worst thing
 * this line could do — it is the line a user scans before deciding not to look
 * any further.
 */

export type Tone = "neutral" | "good" | "warning" | "danger";

export interface Clause {
  /** Which tab resolves this — the clause links there. */
  tab: string;
  text: string;
  tone: Tone;
}

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-text-muted",
  good: "text-text-secondary",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
};

export function deployClause(
  deploys: readonly Deployment[],
  error: string,
  loaded: boolean,
): Clause | null {
  if (error) return { tab: "deployments", text: "Deploy status unavailable", tone: "warning" };
  if (!loaded) return null;
  const latest = deploys[0];
  if (!latest) return { tab: "deployments", text: "Never deployed", tone: "neutral" };
  const when = timeAgo(latest.createdAt);
  if (latest.status === "failed") return { tab: "deployments", text: `Deploy failed ${when}`, tone: "danger" };
  if (latest.status === "success") return { tab: "deployments", text: `Deployed ${when}`, tone: "good" };
  // pending / building / deploying — the header pill already says "Deploying".
  return { tab: "deployments", text: `Deploy ${latest.status} · started ${when}`, tone: "neutral" };
}

export function findingsClause(
  scans: readonly Scan[],
  error: string,
  loaded: boolean,
): Clause | null {
  if (error) return { tab: "security", text: "Scan status unavailable", tone: "warning" };
  if (!loaded) return null;
  const latest = scans[0];
  if (!latest?.summary) return { tab: "security", text: "Not scanned yet", tone: "neutral" };
  const critical = latest.summary.errors;
  if (critical > 0) {
    return {
      tab: "security",
      text: `${critical} critical finding${critical === 1 ? "" : "s"}`,
      tone: "danger",
    };
  }
  return { tab: "security", text: "No critical findings", tone: "good" };
}

/**
 * The strategy is a property of what was deployed, not of the project — so it
 * comes from the most recent successful deploy rather than a project field.
 */
export function infraClause(project: Project, deploys: readonly Deployment[]): Clause {
  const shipped = deploys.find((d) => d.status === "success");
  const strategy = strategyLabels[shipped?.deployStrategy ?? ""] ?? "infrastructure";
  switch (project.infraState) {
    case "live":
      return { tab: "settingsGeneral", text: `Running on ${strategy}`, tone: "good" };
    case "torn_down":
      return { tab: "settingsGeneral", text: "Infrastructure torn down", tone: "warning" };
    default:
      return { tab: "settingsGeneral", text: "No infrastructure", tone: "neutral" };
  }
}

