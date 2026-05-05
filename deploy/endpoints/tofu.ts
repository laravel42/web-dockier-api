import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db, DEFAULT_REGIONS } from "../shared";
import { generatePulumiProgram } from "../pulumi-templates/index";
import { getTemplateConfig } from "../templates";

interface TofuRequest {
  providerId: string;
  repo: string;
  branch: string;
  techStack: string[];
  primaryLanguage: string;
  hasDocker: boolean;
  appName?: string;
  region?: string;
  deployStrategy?: "vps" | "managed" | "static";
  useDocker?: boolean;
  dockerImage?: string;
  instanceType?: string;
  services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  templateId?: string;
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
  { expose: true, method: "POST", path: "/deploy/tofu/generate", auth: true },
  async (params: TofuRequest): Promise<TofuResponse> => {
    const providerRow = await db.queryRow<{
      provider: string; region: string; label: string;
    }>`SELECT provider, region, label FROM server_providers WHERE id = ${params.providerId}`;
    if (!providerRow) throw APIError.notFound("Provider not found");

    const provider = providerRow.provider;
    const region = params.region || providerRow.region || getDefaultRegion(provider);
    const repoName = params.repo.split("/").pop() || "app";
    let appName = params.appName || repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

    // For template projects, use the project name instead of the repo URL
    if (params.templateId && !params.appName) {
      const authData = getAuthData()!;
      const projectRow = await db.queryRow<{ name: string }>`SELECT name FROM projects WHERE app_id = ${authData.appId} ORDER BY created_at DESC LIMIT 1`;
      if (projectRow?.name) {
        appName = projectRow.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      }
    }
    const runtime = params.aiAnalysis
      ? { name: params.aiAnalysis.runtime, version: params.aiAnalysis.runtimeVersion, buildCmd: params.aiAnalysis.buildCommand, startCmd: params.aiAnalysis.startCommand, port: params.aiAnalysis.port }
      : detectRuntime(params.primaryLanguage, params.techStack);

    // Template-specific params for user-data script
    const templateConfig = params.templateId ? getTemplateConfig(params.templateId) : null;

    const script = generatePulumiProgram({
      provider, region, appName, repo: params.repo, branch: params.branch, runtime,
      hasDocker: params.hasDocker, techStack: params.techStack, services: params.services || [],
      aiAnalysis: params.aiAnalysis, deployStrategy: params.deployStrategy,
      useDocker: params.useDocker, dockerImage: params.dockerImage, instanceType: params.instanceType,
      publicDockerImage: templateConfig?.dockerImage,
      dockerEnvVars: templateConfig?.envVars,
      templateSetupScript: templateConfig?.vpsSetupScript,
    });

    return { script, provider, region, appName, estimatedResources: getEstimatedResources(provider, runtime, params.hasDocker, params.services || [], params.deployStrategy) };
  }
);

function getDefaultRegion(provider: string): string {
  return DEFAULT_REGIONS[provider] || "us-east-1";
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

type ServiceEntry = { type: string; name: string; mode: "vps" | "managed" };
type ResourceEstimator = (runtime: { name: string }, hasDocker: boolean, managedSvcs: ServiceEntry[], vpsSvcs: ServiceEntry[], deployStrategy?: string) => string[];

/**
 * Resource estimators per provider.
 * To add a new provider, register its estimator here.
 */
const RESOURCE_ESTIMATORS: Record<string, ResourceEstimator> = {
  aws: (_runtime, hasDocker, managedSvcs) => {
    const r: string[] = ["aws_ecs_service (ECS Fargate)"];
    if (managedSvcs.some(s => s.type === "database")) r.push("aws_rds_instance (Managed PostgreSQL/MySQL)");
    if (managedSvcs.some(s => s.type === "cache")) r.push("aws_elasticache_cluster (Managed Redis)");
    if (managedSvcs.some(s => s.type === "queue")) r.push("aws_sqs_queue (Managed Queue)");
    if (managedSvcs.some(s => s.type === "storage")) r.push("aws_s3_bucket (Object Storage)");
    if (managedSvcs.some(s => s.type === "search")) r.push("aws_opensearch_domain (Managed Search)");
    if (managedSvcs.some(s => s.type === "mail")) r.push("aws_ses_domain_identity (Email)");
    if (hasDocker) r.push("aws_ecr_repository");
    r.push("aws_iam_role");
    return r;
  },
  gcp: (_runtime, _hasDocker, managedSvcs, _vpsSvcs, deployStrategy) => {
    const r: string[] = [];
    if (deployStrategy === "static") {
      r.push("gcp_storage_bucket (Static Website)", "gcp_compute_backend_bucket (Cloud CDN)", "gcp_compute_url_map", "gcp_compute_target_http_proxy", "gcp_compute_global_forwarding_rule", "gcp_storage_bucket_iam_member (public access)");
    } else if (deployStrategy === "managed") {
      r.push("gcp_artifact_registry_repository", "gcp_cloud_run_v2_service", "gcp_cloud_run_v2_service_iam_member (public access)");
      if (managedSvcs.some(s => s.type === "database")) r.push("gcp_sql_database_instance (Cloud SQL PostgreSQL)");
      if (managedSvcs.some(s => s.type === "cache")) r.push("gcp_redis_instance (Memorystore Redis)");
      if (managedSvcs.some(s => s.type === "storage")) r.push("gcp_storage_bucket (Cloud Storage)");
    } else {
      r.push("gcp_compute_instance (e2-small)", "gcp_compute_firewall", "gcp_compute_network", "gcp_compute_address (Static IP)");
      if (managedSvcs.some(s => s.type === "database")) r.push("gcp_sql_database_instance (Cloud SQL PostgreSQL)");
      if (managedSvcs.some(s => s.type === "cache")) r.push("gcp_redis_instance (Memorystore Redis)");
      if (managedSvcs.some(s => s.type === "storage")) r.push("gcp_storage_bucket (Cloud Storage)");
    }
    return r;
  },
};

function getEstimatedResources(provider: string, runtime: { name: string }, hasDocker: boolean, services: ServiceEntry[], deployStrategy?: string): string[] {
  const managedSvcs = services.filter(s => s.mode === "managed");
  const vpsSvcs = services.filter(s => s.mode === "vps");

  const estimator = RESOURCE_ESTIMATORS[provider];
  const resources = estimator
    ? estimator(runtime, hasDocker, managedSvcs, vpsSvcs, deployStrategy)
    : [`${provider}_server`, `${provider}_firewall`];

  if (vpsSvcs.length > 0) resources.push(`VPS-hosted: ${vpsSvcs.map(s => s.name).join(", ")}`);
  return resources;
}
