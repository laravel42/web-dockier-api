import { CloudIcon, SearchIcon, ClipboardListIcon, RocketIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type StepDef = { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

export const STEPS: StepDef[] = [
  { label: "Provider", icon: CloudIcon },
  { label: "Analysis", icon: SearchIcon },
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
