import type { DeploymentStatus, InfraState } from "@/types";

/**
 * Deploy list-dot color from project infra, not from a successful-job badge.
 * Red if the latest deploy failed; green only while infrastructure is live;
 * grey when never deployed, torn down, or otherwise inactive.
 */
export function projectInfraDotClass(
  infraState: InfraState | undefined,
  latestStatus?: DeploymentStatus,
): string {
  if (latestStatus === "failed") return "bg-danger-500";
  if (infraState === "live") return "bg-success-500";
  return "bg-secondary-400";
}
