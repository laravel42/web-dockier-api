import { strategyLabels } from "./styles";

const serviceByProvider: Record<string, Record<string, string>> = {
  aws: { managed: "ECS", vps: "EC2", static: "S3" },
  gcp: { managed: "Cloud Run", vps: "Compute Engine", static: "Cloud Storage" },
};

/** Human-readable deploy target (e.g. ECS, EC2) from provider + strategy. */
export function getDeployServiceLabel(provider: string, strategy: string): string {
  if (!strategy) return "";
  return serviceByProvider[provider]?.[strategy] || strategyLabels[strategy] || strategy;
}
