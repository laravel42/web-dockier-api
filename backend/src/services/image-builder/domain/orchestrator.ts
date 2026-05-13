export type BuildInput = {
  sourceRepo: string;
  sourceRef?: string;
  commitSha?: string;
  imageRepo?: string;
  dockerfilePath?: string;
  buildContext?: string;
  tags?: string[];
  deployTarget?: "ecs" | "ec2" | "s3";
  deployParams?: Record<string, unknown>;
};

export function deriveImageRepo(sourceRepo: string): string {
  const base = sourceRepo.split("/").pop()?.replace(/\.git$/i, "") || "app";
  return base.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function normalizeBuildInput(input: BuildInput) {
  const sourceRef = input.sourceRef || "main";
  const dockerfilePath = input.dockerfilePath || "Dockerfile";
  const buildContext = input.buildContext || ".";
  const imageRepo = input.imageRepo || deriveImageRepo(input.sourceRepo);
  const tags = input.tags?.filter(Boolean) ?? [];

  const inferredRuntime = inferRuntimeFromRepo(input.sourceRepo);
  const inferredPort = inferPortFromDeployTarget(input.deployTarget);

  return {
    sourceRef,
    dockerfilePath,
    buildContext,
    imageRepo,
    tags,
    inferredRuntime,
    inferredPort,
    metadata: {
      runtime: inferredRuntime,
      containerPort: String(inferredPort),
      deployTarget: input.deployTarget ?? "",
      ...toStringRecord(input.deployParams ?? {}),
    },
  };
}

export function composeSubmittedReason(runtime: string): string {
  return `Build queued with ${runtime} runtime detection and orchestration metadata.`;
}

export function composeDeployingReason(deployTarget?: string): string {
  return deployTarget ? `Deploying to ${deployTarget}...` : "Deploying...";
}

function inferRuntimeFromRepo(sourceRepo: string): string {
  const repo = sourceRepo.toLowerCase();
  if (repo.includes("laravel") || repo.includes("php")) return "php";
  if (repo.includes("django") || repo.includes("flask") || repo.includes("fastapi") || repo.includes("python")) return "python";
  if (repo.includes("go") || repo.includes("golang")) return "go";
  return "node";
}

function inferPortFromDeployTarget(target?: "ecs" | "ec2" | "s3"): number {
  if (target === "s3") return 80;
  return 3000;
}

function toStringRecord(input: Record<string, unknown>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    record[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return record;
}
