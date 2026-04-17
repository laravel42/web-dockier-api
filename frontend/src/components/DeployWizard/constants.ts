export const STEPS = [
  { label: "Provider", icon: "☁️" },
  { label: "Service", icon: "⚙️" },
  { label: "Analysis", icon: "🔍" },
  { label: "Plan", icon: "📋" },
  { label: "Config", icon: "🔧" },
  { label: "Deploy", icon: "🚀" },
];

/**
 * Provider metadata for the deploy wizard.
 * To add a new provider, add its entry here with name, icon, color, and available services.
 */
export const PROVIDER_META: Record<string, { name: string; icon: string; color: string; services: Array<{ type: "vps" | "managed" | "static"; label: string; name: string; description: string }> }> = {
  aws: {
    name: "AWS", icon: "amazonaws", color: "bg-orange-500",
    services: [
      { type: "managed", label: "Managed", name: "ECS Fargate", description: "Serverless containers — no servers to manage, auto-scaling included" },
      { type: "vps", label: "VPS", name: "EC2 Instance", description: "Full control over a virtual machine with Docker" },
      { type: "static", label: "Free", name: "S3 + CloudFront", description: "Static website hosting with global CDN" },
    ],
  },
  gcp: {
    name: "Google Cloud", icon: "googlecloud", color: "bg-blue-500",
    services: [
      { type: "managed", label: "Managed", name: "Cloud Run", description: "Serverless containers — auto-scaling, pay per request" },
      { type: "vps", label: "VPS", name: "Compute Engine", description: "Full control over a virtual machine with Docker" },
      { type: "static", label: "Free", name: "Cloud Storage + CDN", description: "Static website hosting with global CDN" },
    ],
  },
};

/**
 * Managed service info per provider.
 * To add a new provider, add its managed service details here.
 */
export const MANAGED_INFO: Record<string, Record<string, { service: string; cost: string }>> = {
  AWS: {
    database: { service: "Amazon RDS (Postgres/MySQL)", cost: "~$15/mo" },
    cache: { service: "Amazon ElastiCache (Redis)", cost: "~$15/mo" },
    queue: { service: "Amazon SQS", cost: "~$1/mo" },
    storage: { service: "Amazon S3", cost: "~$2/mo per 100GB" },
    search: { service: "Amazon OpenSearch", cost: "~$25/mo" },
    mail: { service: "Amazon SES", cost: "~$1/mo" },
  },
  "Google Cloud": {
    database: { service: "Cloud SQL (PostgreSQL)", cost: "~$10/mo" },
    cache: { service: "Memorystore (Redis)", cost: "~$35/mo" },
    storage: { service: "Cloud Storage", cost: "~$2/mo per 100GB" },
    queue: { service: "Cloud Tasks / Pub/Sub", cost: "~$1/mo" },
  },
};

export const FALLBACK_MANAGED: Record<string, { service: string; cost: string }> = {
  database: { service: "Managed Database", cost: "~$15/mo" },
  cache: { service: "Managed Redis", cost: "~$15/mo" },
  queue: { service: "Message Queue", cost: "~$10/mo" },
  storage: { service: "Object Storage", cost: "~$5/mo" },
  search: { service: "Search Service", cost: "~$25/mo" },
  mail: { service: "SMTP Provider", cost: "~$15/mo" },
  broadcasting: { service: "WebSocket Service", cost: "~$10/mo" },
  scheduler: { service: "Scheduler", cost: "~$5/mo" },
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

export { btnPrimary, btnSecondary, inputCls } from "../../utils/styles";

export const INITIAL_WIZARD_STATE: import("./types").WizardState = {
  selectedProvider: "",
  selectedProviderId: "",
  deployStrategy: "vps",
  servicesModes: {},
  environment: "production",
  selectedPlan: 1,
  tofuScript: "",
  tofuResources: [],
  tofuAppName: "",
  tofuRegion: "",
  useDocker: true,
  buildMethod: "dockerfile",
  envVars: [],
  deploymentId: "",
  deployStatus: "",
  deployLogs: [],
  deployAppUrl: "",
  codebuildBuildId: "",
  codebuildImageUri: "",
  codebuildLogsUrl: "",
};
