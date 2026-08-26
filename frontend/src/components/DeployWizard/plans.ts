import type { Plan } from "./types";
import { MANAGED_INFO, FALLBACK_MANAGED } from "./constants";

export function getPlans(
  provider: string,
  environment: "staging" | "production",
  servicesModes: Record<string, "vps" | "managed">,
  templateId?: string
): Plan[] {
  const managedSvcs = Object.entries(servicesModes).filter(([, m]) => m === "managed").map(([t]) => t);
  const isProd = environment === "production";

  const awsEc2Plans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "t3.small" : "t3.micro", cpu: isProd ? "2 vCPU" : "2 vCPU (burstable)", ram: isProd ? "2 GB" : "1 GB",
      storage: "20 GB gp3", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$20/mo" : "~$10/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$15" : "$8" }, { item: "EBS", cost: "$2" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$5" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "t3.medium" : "t3.small", cpu: isProd ? "2 vCPU" : "2 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "30 GB gp3", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$40/mo" : "~$20/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$30" : "$15" }, { item: "EBS", cost: "$3" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$10" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "m6i.large" : "t3.medium", cpu: isProd ? "2 vCPU (dedicated)" : "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "50 GB gp3", network: "Up to 10 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$80/mo" : "~$40/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$60" : "$30" }, { item: "EBS", cost: "$5" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$15" }))],
    },
  ];

  const gcpVpsPlans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: "n2d-standard-2", cpu: "2 vCPU", ram: "8 GB",
      storage: "30 GB pd-balanced", network: "Up to 10 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO["Google Cloud"]?.[s]?.service || s),
      monthlyPrice: isProd ? "~$55/mo" : "~$55/mo",
      breakdown: [{ item: "Compute Engine", cost: "$50" }, { item: "Persistent Disk", cost: "$3" }, { item: "Static IP", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO["Google Cloud"]?.[s]?.service || s, cost: MANAGED_INFO["Google Cloud"]?.[s]?.cost || "~$5" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: "n2d-standard-4", cpu: "4 vCPU", ram: "16 GB",
      storage: "50 GB pd-balanced", network: "Up to 16 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO["Google Cloud"]?.[s]?.service || s),
      monthlyPrice: isProd ? "~$110/mo" : "~$110/mo",
      breakdown: [{ item: "Compute Engine", cost: "$100" }, { item: "Persistent Disk", cost: "$5" }, { item: "Static IP", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO["Google Cloud"]?.[s]?.service || s, cost: MANAGED_INFO["Google Cloud"]?.[s]?.cost || "~$10" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: "n2d-standard-8", cpu: "8 vCPU", ram: "32 GB",
      storage: "100 GB pd-ssd", network: "Up to 32 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO["Google Cloud"]?.[s]?.service || s),
      monthlyPrice: isProd ? "~$225/mo" : "~$225/mo",
      breakdown: [{ item: "Compute Engine", cost: "$200" }, { item: "Persistent Disk (SSD)", cost: "$17" }, { item: "Static IP", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO["Google Cloud"]?.[s]?.service || s, cost: MANAGED_INFO["Google Cloud"]?.[s]?.cost || "~$15" }))],
    },
  ];

  // Generic fallback for providers without specific plans
  const fallback: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "2 vCPU / 2 GB" : "1 vCPU / 1 GB", cpu: isProd ? "2 vCPU" : "1 vCPU", ram: isProd ? "2 GB" : "1 GB",
      storage: "40 GB SSD", network: "2 TB transfer",
      managedServices: managedSvcs.map(s => FALLBACK_MANAGED[s]?.service || s),
      monthlyPrice: isProd ? "~$10/mo" : "~$5/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$10" : "$5" }, ...managedSvcs.map(s => ({ item: FALLBACK_MANAGED[s]?.service || s, cost: FALLBACK_MANAGED[s]?.cost || "~$10" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "2 vCPU / 4 GB" : "2 vCPU / 2 GB", cpu: "2 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "80 GB SSD", network: "4 TB transfer",
      managedServices: managedSvcs.map(s => FALLBACK_MANAGED[s]?.service || s),
      monthlyPrice: isProd ? "~$20/mo" : "~$10/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$20" : "$10" }, ...managedSvcs.map(s => ({ item: FALLBACK_MANAGED[s]?.service || s, cost: FALLBACK_MANAGED[s]?.cost || "~$15" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "4 vCPU / 8 GB" : "2 vCPU / 4 GB", cpu: isProd ? "4 vCPU" : "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "160 GB SSD", network: "8 TB transfer",
      managedServices: managedSvcs.map(s => FALLBACK_MANAGED[s]?.service || s),
      monthlyPrice: isProd ? "~$40/mo" : "~$20/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$40" : "$20" }, ...managedSvcs.map(s => ({ item: FALLBACK_MANAGED[s]?.service || s, cost: FALLBACK_MANAGED[s]?.cost || "~$15" }))],
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
