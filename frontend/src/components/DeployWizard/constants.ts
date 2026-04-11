export const STEPS = [
  { label: "Provider", icon: "☁️" },
  { label: "Service", icon: "⚙️" },
  { label: "Analysis", icon: "🔍" },
  { label: "Plan", icon: "📋" },
  { label: "Config", icon: "🔧" },
  { label: "Deploy", icon: "🚀" },
];

export const PROVIDER_META: Record<string, { name: string; icon: string; color: string; services: Array<{ type: "vps" | "managed" | "static"; label: string; name: string; description: string }> }> = {
  aws: {
    name: "AWS", icon: "amazonaws", color: "bg-orange-500",
    services: [
      { type: "managed", label: "Managed", name: "ECS Fargate", description: "Serverless containers — no servers to manage, auto-scaling included" },
      { type: "vps", label: "VPS", name: "EC2 Instance", description: "Full control over a virtual machine with Docker" },
      { type: "static", label: "Free", name: "S3 + CloudFront", description: "Static website hosting with global CDN" },
    ],
  },
  digitalocean: {
    name: "DigitalOcean", icon: "digitalocean", color: "bg-blue-600",
    services: [
      { type: "vps", label: "VPS", name: "Droplet", description: "Simple cloud VPS with Docker pre-installed" },
      { type: "managed", label: "Managed", name: "App Platform", description: "Managed PaaS — deploy from Git with zero config" },
    ],
  },
  hetzner: {
    name: "Hetzner", icon: "hetzner", color: "bg-red-600",
    services: [
      { type: "vps", label: "VPS", name: "Cloud Server", description: "High-performance VPS in Europe with excellent price/performance" },
    ],
  },
  vultr: {
    name: "Vultr", icon: "vultr", color: "bg-sky-600",
    services: [
      { type: "vps", label: "VPS", name: "Cloud Compute", description: "SSD cloud servers in 32 locations worldwide" },
    ],
  },
  linode: {
    name: "Linode (Akamai)", icon: "linode", color: "bg-green-600",
    services: [
      { type: "vps", label: "VPS", name: "Linode Instance", description: "Simple, predictable pricing with dedicated resources" },
    ],
  },
  upcloud: {
    name: "UpCloud", icon: "upcloud", color: "bg-violet-600",
    services: [
      { type: "vps", label: "VPS", name: "Cloud Server", description: "MaxIOPS storage for fast I/O performance" },
    ],
  },
  katapult: {
    name: "Katapult", icon: "katapult", color: "bg-pink-600",
    services: [
      { type: "vps", label: "VPS", name: "Virtual Machine", description: "Developer-friendly cloud with simple API" },
    ],
  },
  hostinger: {
    name: "Hostinger", icon: "hostinger", color: "bg-indigo-600",
    services: [
      { type: "vps", label: "VPS", name: "VPS Hosting", description: "Affordable VPS with global data centers" },
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
  cloudflare: {
    name: "Cloudflare", icon: "cloudflare", color: "bg-orange-500",
    services: [
      { type: "static", label: "Free", name: "Cloudflare Pages", description: "Free static site hosting with unlimited bandwidth and global CDN" },
    ],
  },
};

export const MANAGED_INFO: Record<string, Record<string, { service: string; cost: string }>> = {
  AWS: {
    database: { service: "Amazon RDS (Postgres/MySQL)", cost: "~$15/mo" },
    cache: { service: "Amazon ElastiCache (Redis)", cost: "~$15/mo" },
    queue: { service: "Amazon SQS", cost: "~$1/mo" },
    storage: { service: "Amazon S3", cost: "~$2/mo per 100GB" },
    search: { service: "Amazon OpenSearch", cost: "~$25/mo" },
    mail: { service: "Amazon SES", cost: "~$1/mo" },
  },
  DigitalOcean: {
    database: { service: "Managed Database", cost: "~$15/mo" },
    cache: { service: "Managed Redis", cost: "~$15/mo" },
    storage: { service: "Spaces (S3-compatible)", cost: "$5/mo" },
  },
  Hetzner: {
    database: { service: "Managed Database (Postgres)", cost: "~€15/mo" },
    storage: { service: "Object Storage (S3-compatible)", cost: "~€5/mo per TB" },
  },
  Vultr: {
    database: { service: "Managed Database", cost: "~$15/mo" },
    storage: { service: "Object Storage", cost: "$5/mo" },
  },
  "Google Cloud": {
    database: { service: "Cloud SQL (PostgreSQL)", cost: "~$10/mo" },
    cache: { service: "Memorystore (Redis)", cost: "~$35/mo" },
    storage: { service: "Cloud Storage", cost: "~$2/mo per 100GB" },
    queue: { service: "Cloud Tasks / Pub/Sub", cost: "~$1/mo" },
  },
  Linode: {
    database: { service: "Managed Database", cost: "~$15/mo" },
    storage: { service: "Object Storage", cost: "$5/mo" },
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
  digitalocean: [
    { id: "nyc1", name: "New York 1", flag: "🇺🇸" },
    { id: "nyc3", name: "New York 3", flag: "🇺🇸" },
    { id: "sfo3", name: "San Francisco 3", flag: "🇺🇸" },
    { id: "ams3", name: "Amsterdam 3", flag: "🇳🇱" },
    { id: "lon1", name: "London 1", flag: "🇬🇧" },
    { id: "fra1", name: "Frankfurt 1", flag: "🇩🇪" },
    { id: "sgp1", name: "Singapore 1", flag: "🇸🇬" },
    { id: "blr1", name: "Bangalore 1", flag: "🇮🇳" },
    { id: "syd1", name: "Sydney 1", flag: "🇦🇺" },
  ],
  hetzner: [
    { id: "fsn1", name: "Falkenstein", flag: "🇩🇪" },
    { id: "nbg1", name: "Nuremberg", flag: "🇩🇪" },
    { id: "hel1", name: "Helsinki", flag: "🇫🇮" },
    { id: "ash", name: "Ashburn, VA", flag: "🇺🇸" },
    { id: "hil", name: "Hillsboro, OR", flag: "🇺🇸" },
  ],
  vultr: [
    { id: "ewr", name: "New Jersey", flag: "🇺🇸" },
    { id: "ord", name: "Chicago", flag: "🇺🇸" },
    { id: "dfw", name: "Dallas", flag: "🇺🇸" },
    { id: "lax", name: "Los Angeles", flag: "🇺🇸" },
    { id: "ams", name: "Amsterdam", flag: "🇳🇱" },
    { id: "lhr", name: "London", flag: "🇬🇧" },
    { id: "fra", name: "Frankfurt", flag: "🇩🇪" },
    { id: "nrt", name: "Tokyo", flag: "🇯🇵" },
    { id: "sgp", name: "Singapore", flag: "🇸🇬" },
    { id: "syd", name: "Sydney", flag: "🇦🇺" },
  ],
  linode: [
    { id: "us-east", name: "Newark, NJ", flag: "🇺🇸" },
    { id: "us-central", name: "Dallas, TX", flag: "🇺🇸" },
    { id: "us-west", name: "Fremont, CA", flag: "🇺🇸" },
    { id: "eu-west", name: "London", flag: "🇬🇧" },
    { id: "eu-central", name: "Frankfurt", flag: "🇩🇪" },
    { id: "ap-south", name: "Singapore", flag: "🇸🇬" },
    { id: "ap-northeast", name: "Tokyo", flag: "🇯🇵" },
    { id: "ap-southeast", name: "Sydney", flag: "🇦🇺" },
  ],
  upcloud: [
    { id: "de-fra1", name: "Frankfurt", flag: "🇩🇪" },
    { id: "fi-hel1", name: "Helsinki", flag: "🇫🇮" },
    { id: "nl-ams1", name: "Amsterdam", flag: "🇳🇱" },
    { id: "us-chi1", name: "Chicago", flag: "🇺🇸" },
    { id: "us-nyc1", name: "New York", flag: "🇺🇸" },
    { id: "sg-sin1", name: "Singapore", flag: "🇸🇬" },
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
  cloudflare: [
    { id: "global", name: "Global (300+ cities)", flag: "🌍" },
  ],
};

export { btnPrimary, btnSecondary } from "../../utils/styles";

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
