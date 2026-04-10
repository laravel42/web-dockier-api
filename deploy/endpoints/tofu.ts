import { api, APIError } from "encore.dev/api";
import { db } from "../shared";
import { generatePulumiProgram } from "../pulumi-templates/index";

interface TofuRequest {
  providerId: string;
  repo: string;
  branch: string;
  techStack: string[];
  primaryLanguage: string;
  hasDocker: boolean;
  appName?: string;
  region?: string;
  deployStrategy?: "vps" | "managed" | "serverless" | "static";
  useDocker?: boolean;
  dockerImage?: string;
  instanceType?: string;
  services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  aiAnalysis?: {
    runtime: string;
    runtimeVersion: string;
    framework: string;
    frameworkVersion: string;
    phpExtensions?: string[];
    nodeVersion?: string;
    buildCommand: string;
    startCommand: string;
    port: number;
    needsScheduler: boolean;
    needsQueueWorker: boolean;
    needsWebsockets: boolean;
    envVars: string[];
    postDeployCommands: string[];
    nginxConfig: "php-fpm" | "reverse-proxy" | "static";
    summary: string;
  };
}

interface TofuResponse {
  script: string;
  provider: string;
  region: string;
  appName: string;
  estimatedResources: string[];
}

export const generateTofu = api(
  { method: "POST", path: "/deploy/tofu/generate", auth: true },
  async (params: TofuRequest): Promise<TofuResponse> => {
    const providerRow = await db.queryRow<{
      provider: string; region: string; label: string;
    }>`SELECT provider, region, label FROM server_providers WHERE id = ${params.providerId}`;
    if (!providerRow) throw APIError.notFound("Provider not found");

    const provider = providerRow.provider;
    const region = params.region || providerRow.region || getDefaultRegion(provider);
    const repoName = params.repo.split("/").pop() || "app";
    const appName = params.appName || repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const runtime = params.aiAnalysis
      ? { name: params.aiAnalysis.runtime, version: params.aiAnalysis.runtimeVersion, buildCmd: params.aiAnalysis.buildCommand, startCmd: params.aiAnalysis.startCommand, port: params.aiAnalysis.port }
      : detectRuntime(params.primaryLanguage, params.techStack);

    const script = generatePulumiProgram({
      provider, region, appName, repo: params.repo, branch: params.branch, runtime,
      hasDocker: params.hasDocker, techStack: params.techStack, services: params.services || [],
      aiAnalysis: params.aiAnalysis, deployStrategy: params.deployStrategy,
      useDocker: params.useDocker, dockerImage: params.dockerImage, instanceType: params.instanceType,
    });

    return { script, provider, region, appName, estimatedResources: getEstimatedResources(provider, runtime, params.hasDocker, params.services || [], params.deployStrategy) };
  }
);

function getDefaultRegion(provider: string): string {
  const defaults: Record<string, string> = {
    digitalocean: "nyc3", hetzner: "nbg1", vultr: "ewr", linode: "us-east",
    aws: "us-east-1", upcloud: "us-nyc1", katapult: "london", hostinger: "us",
    gcp: "us-central1",
  };
  return defaults[provider] || "us-east-1";
}

function detectRuntime(lang: string, techStack: string[]): { name: string; version: string; buildCmd: string; startCmd: string; port: number } {
  const lower = lang.toLowerCase();
  const stack = techStack.map(s => s.toLowerCase());
  if (stack.includes("laravel") || lower === "php") return { name: "php", version: "8.3", buildCmd: "composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache", startCmd: "php artisan serve --host=0.0.0.0 --port=8080", port: 8080 };
  if (stack.includes("next.js") || stack.includes("nuxt")) return { name: "node", version: "20", buildCmd: "npm ci && npm run build", startCmd: "npm start", port: 3000 };
  if (lower === "typescript" || lower === "javascript" || stack.includes("node.js")) return { name: "node", version: "20", buildCmd: "npm ci && npm run build", startCmd: "npm start", port: 3000 };
  if (lower === "python" || stack.includes("django") || stack.includes("flask") || stack.includes("fastapi")) return { name: "python", version: "3.12", buildCmd: "pip install -r requirements.txt", startCmd: "gunicorn app:app --bind 0.0.0.0:8000", port: 8000 };
  if (lower === "go" || lower === "golang") return { name: "go", version: "1.22", buildCmd: "go build -o app .", startCmd: "./app", port: 8080 };
  if (lower === "ruby" || stack.includes("rails")) return { name: "ruby", version: "3.3", buildCmd: "bundle install && rails assets:precompile", startCmd: "rails server -b 0.0.0.0 -p 3000", port: 3000 };
  if (lower === "java" || stack.includes("spring")) return { name: "java", version: "21", buildCmd: "./gradlew build", startCmd: "java -jar build/libs/app.jar", port: 8080 };
  if (lower === "rust") return { name: "rust", version: "1.77", buildCmd: "cargo build --release", startCmd: "./target/release/app", port: 8080 };
  if (lower === "c#" || lower === "c#/.net" || stack.includes(".net")) return { name: "dotnet", version: "8.0", buildCmd: "dotnet publish -c Release", startCmd: "dotnet run", port: 5000 };
  return { name: "node", version: "20", buildCmd: "npm ci && npm run build", startCmd: "npm start", port: 3000 };
}

function getEstimatedResources(provider: string, runtime: { name: string }, hasDocker: boolean, services: Array<{ type: string; name: string; mode: "vps" | "managed" }>, deployStrategy?: string): string[] {
  const resources: string[] = [];
  const managedSvcs = services.filter(s => s.mode === "managed");
  const vpsSvcs = services.filter(s => s.mode === "vps");
  switch (provider) {
    case "digitalocean":
      resources.push("digitalocean_app (App Platform)");
      if (managedSvcs.some(s => s.type === "database")) resources.push("digitalocean_database_cluster (Managed DB)");
      if (managedSvcs.some(s => s.type === "cache")) resources.push("digitalocean_database_cluster (Managed Redis)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("digitalocean_spaces_bucket (Object Storage)");
      resources.push("digitalocean_domain (custom domain)");
      break;
    case "hetzner":
      resources.push("hcloud_server (CX22 — 2 vCPU, 4GB RAM)", "hcloud_firewall", "hcloud_ssh_key");
      if (vpsSvcs.some(s => s.type === "database")) resources.push("Database installed on VPS");
      if (vpsSvcs.some(s => s.type === "cache")) resources.push("Redis installed on VPS");
      if (managedSvcs.some(s => s.type === "database")) resources.push("External managed DB (e.g. PlanetScale, Neon)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("hcloud_volume (Block Storage)");
      break;
    case "vultr":
      resources.push("vultr_instance (vc2-1c-1gb)", "vultr_firewall_group", "vultr_ssh_key");
      if (managedSvcs.some(s => s.type === "database")) resources.push("vultr_database (Managed DB)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("vultr_object_storage");
      break;
    case "aws":
      resources.push("aws_ecs_service (ECS Fargate)");
      if (managedSvcs.some(s => s.type === "database")) resources.push("aws_rds_instance (Managed PostgreSQL/MySQL)");
      if (managedSvcs.some(s => s.type === "cache")) resources.push("aws_elasticache_cluster (Managed Redis)");
      if (managedSvcs.some(s => s.type === "queue")) resources.push("aws_sqs_queue (Managed Queue)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("aws_s3_bucket (Object Storage)");
      if (managedSvcs.some(s => s.type === "search")) resources.push("aws_opensearch_domain (Managed Search)");
      if (managedSvcs.some(s => s.type === "mail")) resources.push("aws_ses_domain_identity (Email)");
      if (hasDocker) resources.push("aws_ecr_repository");
      resources.push("aws_iam_role");
      break;
    case "linode":
      resources.push("linode_instance (g6-nanode-1)", "linode_firewall", "linode_sshkey");
      if (managedSvcs.some(s => s.type === "database")) resources.push("linode_database_mysql (Managed DB)");
      if (managedSvcs.some(s => s.type === "storage")) resources.push("linode_object_storage_bucket");
      break;
    case "gcp":
      if (deployStrategy === "static") {
        resources.push("gcp_storage_bucket (Static Website)", "gcp_compute_backend_bucket (Cloud CDN)", "gcp_compute_url_map", "gcp_compute_target_http_proxy", "gcp_compute_global_forwarding_rule", "gcp_storage_bucket_iam_member (public access)");
      } else if (deployStrategy === "managed") {
        resources.push("gcp_artifact_registry_repository", "gcp_cloud_run_v2_service", "gcp_cloud_run_v2_service_iam_member (public access)");
        if (managedSvcs.some(s => s.type === "database")) resources.push("gcp_sql_database_instance (Cloud SQL PostgreSQL)");
        if (managedSvcs.some(s => s.type === "storage")) resources.push("gcp_storage_bucket (Cloud Storage)");
      } else {
        resources.push("gcp_compute_instance (e2-small)", "gcp_compute_firewall", "gcp_compute_network", "gcp_compute_address (Static IP)");
        if (managedSvcs.some(s => s.type === "database")) resources.push("gcp_sql_database_instance (Cloud SQL PostgreSQL)");
        if (managedSvcs.some(s => s.type === "storage")) resources.push("gcp_storage_bucket (Cloud Storage)");
      }
      break;
    default:
      resources.push(`${provider}_server`, `${provider}_firewall`);
  }
  if (vpsSvcs.length > 0) resources.push(`VPS-hosted: ${vpsSvcs.map(s => s.name).join(", ")}`);
  return resources;
}
