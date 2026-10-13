import type { Plan } from "./types";

/** Generic display names for externally-managed service types (provider-agnostic — the user brings their own). */
const EXTERNAL_SERVICE_NAMES: Record<string, string> = {
  database: "Database (external)",
  cache: "Cache (external)",
  queue: "Message Queue (external)",
  storage: "Object Storage (external)",
  mail: "Mail Service (external)",
  search: "Search Engine (external)",
  broadcasting: "WebSocket / Broadcasting (external)",
};

export function getPlans(
  provider: string,
  environment: "staging" | "production",
  servicesModes: Record<string, "vps" | "managed">,
  templateId?: string
): Plan[] {
  // Managed = user brings their own external service (Neon, Supabase, …), billed by their provider.
  // We list them for context but never add a Dockier-invented cost to the estimate.
  const managedServices = Object.entries(servicesModes)
    .filter(([, m]) => m === "managed")
    .map(([t]) => EXTERNAL_SERVICE_NAMES[t] || t);
  const isProd = environment === "production";

  const awsEc2Plans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "t3.small" : "t3.micro", cpu: isProd ? "2 vCPU" : "2 vCPU (burstable)", ram: isProd ? "2 GB" : "1 GB",
      storage: "20 GB gp3", network: "Up to 5 Gbps",
      managedServices,
      monthlyPrice: isProd ? "~$20/mo" : "~$10/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$15" : "$8" }, { item: "EBS", cost: "$2" }],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "t3.medium" : "t3.small", cpu: isProd ? "2 vCPU" : "2 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "30 GB gp3", network: "Up to 5 Gbps",
      managedServices,
      monthlyPrice: isProd ? "~$40/mo" : "~$20/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$30" : "$15" }, { item: "EBS", cost: "$3" }],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "m6i.large" : "t3.medium", cpu: isProd ? "2 vCPU (dedicated)" : "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "50 GB gp3", network: "Up to 10 Gbps",
      managedServices,
      monthlyPrice: isProd ? "~$80/mo" : "~$40/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$60" : "$30" }, { item: "EBS", cost: "$5" }],
    },
  ];

  const gcpVpsPlans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: "n2d-standard-2", cpu: "2 vCPU", ram: "8 GB",
      storage: "30 GB pd-balanced", network: "Up to 10 Gbps",
      managedServices,
      monthlyPrice: isProd ? "~$55/mo" : "~$55/mo",
      breakdown: [{ item: "Compute Engine", cost: "$50" }, { item: "Persistent Disk", cost: "$3" }, { item: "Static IP", cost: "$1" }],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: "n2d-standard-4", cpu: "4 vCPU", ram: "16 GB",
      storage: "50 GB pd-balanced", network: "Up to 16 Gbps",
      managedServices,
      monthlyPrice: isProd ? "~$110/mo" : "~$110/mo",
      breakdown: [{ item: "Compute Engine", cost: "$100" }, { item: "Persistent Disk", cost: "$5" }, { item: "Static IP", cost: "$1" }],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: "n2d-standard-8", cpu: "8 vCPU", ram: "32 GB",
      storage: "100 GB pd-ssd", network: "Up to 32 Gbps",
      managedServices,
      monthlyPrice: isProd ? "~$225/mo" : "~$225/mo",
      breakdown: [{ item: "Compute Engine", cost: "$200" }, { item: "Persistent Disk (SSD)", cost: "$17" }, { item: "Static IP", cost: "$1" }],
    },
  ];

  // Generic fallback for providers without specific plans
  const fallback: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "2 vCPU / 2 GB" : "1 vCPU / 1 GB", cpu: isProd ? "2 vCPU" : "1 vCPU", ram: isProd ? "2 GB" : "1 GB",
      storage: "40 GB SSD", network: "2 TB transfer",
      managedServices,
      monthlyPrice: isProd ? "~$10/mo" : "~$5/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$10" : "$5" }],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "2 vCPU / 4 GB" : "2 vCPU / 2 GB", cpu: "2 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "80 GB SSD", network: "4 TB transfer",
      managedServices,
      monthlyPrice: isProd ? "~$20/mo" : "~$10/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$20" : "$10" }],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "4 vCPU / 8 GB" : "2 vCPU / 4 GB", cpu: isProd ? "4 vCPU" : "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "160 GB SSD", network: "8 TB transfer",
      managedServices,
      monthlyPrice: isProd ? "~$40/mo" : "~$20/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$40" : "$20" }],
    },
  ];

  const plans: Record<string, Plan[]> = {
    aws: awsEc2Plans,
    gcp: gcpVpsPlans,
  };

  const result = plans[provider] || fallback;

  // WordPress templates need at least 2 GB RAM for MySQL + WordPress + imports
  if (templateId === "wordpress" && environment === "staging") {
    return result.filter(p => p.tier !== "value");
  }

  return result;
}
