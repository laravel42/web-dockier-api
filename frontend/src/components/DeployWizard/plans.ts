import type { Plan } from "./types";
import { MANAGED_INFO, FALLBACK_MANAGED } from "./constants";

export function getPlans(
  provider: string,
  environment: "staging" | "production",
  servicesModes: Record<string, "vps" | "managed">,
  deployStrategy: "vps" | "managed" | "static",
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

  const awsEcsPlans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "0.5 vCPU / 2 GB" : "0.25 vCPU / 1 GB", cpu: isProd ? "0.5 vCPU" : "0.25 vCPU", ram: isProd ? "2 GB" : "1 GB",
      storage: "20 GB (ephemeral)", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$25/mo" : "~$10/mo",
      breakdown: [{ item: "ECS Fargate", cost: isProd ? "$18" : "$5" }, { item: "ECR", cost: "$1" }, { item: "CloudWatch", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$5" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "1 vCPU / 4 GB" : "0.5 vCPU / 2 GB", cpu: isProd ? "1 vCPU" : "0.5 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "30 GB (ephemeral)", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$50/mo" : "~$25/mo",
      breakdown: [{ item: "ECS Fargate", cost: isProd ? "$35" : "$18" }, { item: "ECR", cost: "$1" }, { item: "CloudWatch", cost: "$2" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$10" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "2 vCPU / 8 GB" : "1 vCPU / 4 GB", cpu: isProd ? "2 vCPU" : "1 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "50 GB (ephemeral)", network: "Up to 10 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$100/mo" : "~$50/mo",
      breakdown: [{ item: "ECS Fargate", cost: isProd ? "$70" : "$35" }, { item: "ECR", cost: "$1" }, { item: "CloudWatch", cost: "$3" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$15" }))],
    },
  ];

  const awsS3Plans: Plan[] = [
    {
      tier: "value", label: "S3 + CloudFront (Free Tier)", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: "s3-cf-free", cpu: "N/A", ram: "N/A", storage: "5 GB (S3)", network: "1 TB/mo (CloudFront)",
      managedServices: ["S3 Static Hosting", "CloudFront CDN"],
      monthlyPrice: "Free – ~$1/mo",
      breakdown: [{ item: "S3 Storage", cost: "~$0.02/GB" }, { item: "CloudFront", cost: "Free (1TB/mo)" }, { item: "Route 53", cost: "$0.50" }],
    },
    {
      tier: "standard", label: "S3 + CloudFront (Production)", badge: "Recommended", badgeColor: "bg-primary-50 text-primary-500",
      instance: "s3-cf-prod", cpu: "N/A", ram: "N/A", storage: "50 GB (S3)", network: "10 TB/mo (CloudFront)",
      managedServices: ["S3 Static Hosting", "CloudFront CDN", "ACM SSL"],
      monthlyPrice: "~$2 – $10/mo",
      breakdown: [{ item: "S3 Storage", cost: "~$0.02/GB" }, { item: "CloudFront", cost: "~$5" }, { item: "Route 53", cost: "$0.50" }, { item: "ACM SSL", cost: "Free" }],
    },
  ];

  const gcpStaticPlans: Plan[] = [
    {
      tier: "value", label: "Cloud Storage + CDN (Staging)", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: "gcs-cdn-staging", cpu: "N/A", ram: "N/A", storage: "5 GB (Cloud Storage)", network: "1 TB/mo (Cloud CDN)",
      managedServices: ["Cloud Storage Static Hosting", "Cloud CDN"],
      monthlyPrice: isProd ? "~$1 – $3/mo" : "Free – ~$1/mo",
      breakdown: [{ item: "Cloud Storage", cost: "~$0.02/GB" }, { item: "Cloud CDN", cost: "Free (first 1TB)" }, { item: "Global Forwarding Rule", cost: "~$0.50" }],
    },
    {
      tier: "standard", label: "Cloud Storage + CDN (Production)", badge: "Recommended", badgeColor: "bg-primary-50 text-primary-500",
      instance: "gcs-cdn-prod", cpu: "N/A", ram: "N/A", storage: "50 GB (Cloud Storage)", network: "10 TB/mo (Cloud CDN)",
      managedServices: ["Cloud Storage Static Hosting", "Cloud CDN", "Global Load Balancer"],
      monthlyPrice: isProd ? "~$5 – $15/mo" : "~$2 – $5/mo",
      breakdown: [{ item: "Cloud Storage", cost: "~$0.02/GB" }, { item: "Cloud CDN", cost: "~$5" }, { item: "Global Forwarding Rule", cost: "~$1" }, { item: "Load Balancer", cost: "~$3" }],
    },
  ];

  const plans: Record<string, Plan[]> = {
    aws: deployStrategy === "vps" ? awsEc2Plans : deployStrategy === "static" ? awsS3Plans : awsEcsPlans,
    gcp: deployStrategy === "static" ? gcpStaticPlans : deployStrategy === "managed" ? [
      {
        tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
        instance: "1 vCPU / 512 MB", cpu: "1 vCPU", ram: "512 MB",
        storage: "Included", network: "Pay per request",
        managedServices: managedSvcs.map(s => MANAGED_INFO["Google Cloud"]?.[s]?.service || s),
        monthlyPrice: isProd ? "~$15/mo" : "~$5/mo",
        breakdown: [{ item: "Cloud Run", cost: isProd ? "$10" : "$3" }, { item: "Artifact Registry", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO["Google Cloud"]?.[s]?.service || s, cost: MANAGED_INFO["Google Cloud"]?.[s]?.cost || "~$5" }))],
      },
      {
        tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
        instance: "2 vCPU / 1 GB", cpu: "2 vCPU", ram: "1 GB",
        storage: "Included", network: "Pay per request",
        managedServices: managedSvcs.map(s => MANAGED_INFO["Google Cloud"]?.[s]?.service || s),
        monthlyPrice: isProd ? "~$40/mo" : "~$15/mo",
        breakdown: [{ item: "Cloud Run", cost: isProd ? "$35" : "$12" }, { item: "Artifact Registry", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO["Google Cloud"]?.[s]?.service || s, cost: MANAGED_INFO["Google Cloud"]?.[s]?.cost || "~$10" }))],
      },
      {
        tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
        instance: "4 vCPU / 2 GB", cpu: "4 vCPU", ram: "2 GB",
        storage: "Included", network: "Pay per request",
        managedServices: managedSvcs.map(s => MANAGED_INFO["Google Cloud"]?.[s]?.service || s),
        monthlyPrice: isProd ? "~$90/mo" : "~$40/mo",
        breakdown: [{ item: "Cloud Run", cost: isProd ? "$80" : "$35" }, { item: "Artifact Registry", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO["Google Cloud"]?.[s]?.service || s, cost: MANAGED_INFO["Google Cloud"]?.[s]?.cost || "~$15" }))],
      },
    ] : [
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
    ],
  };

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

  const result = plans[provider] || fallback;

  // WordPress templates need at least 2 GB RAM for MySQL + WordPress + imports
  if (templateId === "wordpress" && environment === "staging" && deployStrategy === "vps") {
    return result.filter(p => p.tier !== "value");
  }

  return result;
}
