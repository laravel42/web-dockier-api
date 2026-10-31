import { CloudIcon, SearchIcon, ClipboardListIcon, LayersIcon, RocketIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type StepDef = { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

/**
 * Named step indices.
 *
 * The wizard's navigation, titles, button states and per-step validation all
 * key off the step number, in a dozen places across DeployWizard.tsx and
 * useDeployWizard.ts. Those were literals, so inserting a step meant finding
 * and shifting every one of them correctly — the kind of edit that silently
 * leaves one behind. Naming them makes an insertion a change to this list.
 */
export const STEP = {
  PROVIDER: 0,
  ANALYSIS: 1,
  /** What KIND of deploy: server, static site, or the repo's compose stack. */
  TARGET: 2,
  /** How big and where: environment, region, instance size. */
  PLAN: 3,
  DEPLOY: 4,
} as const;

export const STEPS: StepDef[] = [
  { label: "Provider", icon: CloudIcon },
  { label: "Analysis", icon: SearchIcon },
  { label: "Target", icon: LayersIcon },
  { label: "Plan", icon: ClipboardListIcon },
  { label: "Deploy", icon: RocketIcon },
];

/**
 * Provider metadata for the deploy wizard.
 * To add a new provider, add its entry here with name, icon, color, and available services.
 */
export const PROVIDER_META: Record<string, { name: string; icon: string; color: string; services: Array<{ type: "vps"; label: string; name: string; description: string }> }> = {
  aws: {
    name: "AWS", icon: "amazonaws", color: "bg-orange-500",
    services: [
      { type: "vps", label: "VPS", name: "EC2 Instance", description: "Full control over a virtual machine with Docker" },
    ],
  },
  gcp: {
    name: "Google Cloud", icon: "googlecloud", color: "bg-blue-500",
    services: [
      { type: "vps", label: "VPS", name: "Compute Engine", description: "Full control over a virtual machine with Docker" },
    ],
  },
};

/**
 * Available regions per provider.
 * To add a new provider, add its regions here.
 */
export const PROVIDER_REGIONS: Record<string, Array<{ id: string; name: string; flag: string }>> = {
  aws: [
    { id: "us-east-1", name: "US East (N. Virginia)", flag: "🇺🇸" },
    { id: "us-east-2", name: "US East (Ohio)", flag: "🇺🇸" },
    { id: "us-west-1", name: "US West (N. California)", flag: "🇺🇸" },
    { id: "us-west-2", name: "US West (Oregon)", flag: "🇺🇸" },
    { id: "eu-west-1", name: "Europe (Ireland)", flag: "🇮🇪" },
    { id: "eu-west-2", name: "Europe (London)", flag: "🇬🇧" },
    { id: "eu-central-1", name: "Europe (Frankfurt)", flag: "🇩🇪" },
    { id: "ap-southeast-1", name: "Asia Pacific (Singapore)", flag: "🇸🇬" },
    { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)", flag: "🇯🇵" },
    { id: "sa-east-1", name: "South America (São Paulo)", flag: "🇧🇷" },
  ],
  gcp: [
    { id: "us-central1", name: "Iowa", flag: "🇺🇸" },
    { id: "us-east1", name: "South Carolina", flag: "🇺🇸" },
    { id: "us-west1", name: "Oregon", flag: "🇺🇸" },
    { id: "europe-west1", name: "Belgium", flag: "🇧🇪" },
    { id: "europe-west2", name: "London", flag: "🇬🇧" },
    { id: "europe-west3", name: "Frankfurt", flag: "🇩🇪" },
    { id: "asia-east1", name: "Taiwan", flag: "🇹🇼" },
    { id: "asia-northeast1", name: "Tokyo", flag: "🇯🇵" },
    { id: "asia-southeast1", name: "Singapore", flag: "🇸🇬" },
    { id: "southamerica-east1", name: "São Paulo", flag: "🇧🇷" },
  ],
};

/** Preselect when exactly one provider type is configured. */
export function getDefaultProviderSelection(
  providers: Array<{ id: string; provider: string }>,
): Pick<import("./types").WizardState, "selectedProvider" | "selectedProviderId" | "tofuRegion"> | null {
  if (providers.length === 0) return null;
  const slugs = [...new Set(providers.map((p) => p.provider))];
  if (slugs.length !== 1) return null;
  const slug = slugs[0];
  const first = providers.find((p) => p.provider === slug);
  if (!first) return null;
  return {
    selectedProvider: slug,
    selectedProviderId: first.id,
    tofuRegion: PROVIDER_REGIONS[slug]?.[0]?.id || "",
  };
}

export const INITIAL_WIZARD_STATE: import("./types").WizardState = {
  selectedProvider: "",
  selectedProviderId: "",
  deployStrategy: "vps",
  compose: { path: "" },
  envVars: [],
  useRepoDockerfile: true,
  servicesModes: {},
  envDetectionHints: {},
  manualServiceOverrides: [],
  environment: "production",
  selectedPlan: 1,
  tofuRegion: "",
  deploymentId: "",
  deployStatus: "",
  deployLogs: [],
  deployAppUrl: "",
};
