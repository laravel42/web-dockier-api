import type { ServiceEntry } from "../types.js";

export type DeployTemplate = {
  id: string;
  provider: "aws" | "gcp";
  strategy: "vps" | "managed" | "static";
  runtimeFamily: "node" | "python" | "php" | "go" | "generic";
  label: string;
  description: string;
  defaultServices: ServiceEntry[];
  buildMethod: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
};

const DEPLOY_TEMPLATES: DeployTemplate[] = [
  {
    id: "aws-managed-node",
    provider: "aws",
    strategy: "managed",
    runtimeFamily: "node",
    label: "AWS Managed Node API",
    description: "ECS Fargate service with optional managed database/cache add-ons.",
    defaultServices: [],
    buildMethod: "codebuild",
  },
  {
    id: "aws-vps-generic",
    provider: "aws",
    strategy: "vps",
    runtimeFamily: "generic",
    label: "AWS EC2 VPS",
    description: "Single-instance EC2 deployment for custom stacks.",
    defaultServices: [],
    buildMethod: "dockerfile",
  },
  {
    id: "gcp-managed-service",
    provider: "gcp",
    strategy: "managed",
    runtimeFamily: "generic",
    label: "GCP Cloud Run Service",
    description: "Containerized service deployed to Cloud Run.",
    defaultServices: [],
    buildMethod: "nixpacks",
  },
  {
    id: "gcp-static-site",
    provider: "gcp",
    strategy: "static",
    runtimeFamily: "generic",
    label: "GCP Static Site",
    description: "Cloud Storage and CDN-oriented static hosting path.",
    defaultServices: [],
    buildMethod: "railpack",
  },
];

function normalizeRuntimeFamily(primaryLanguage: string, techStack: string[]): DeployTemplate["runtimeFamily"] {
  const language = primaryLanguage.toLowerCase();
  const stack = techStack.map((item) => item.toLowerCase());
  if (stack.includes("node.js") || stack.includes("next.js") || language === "javascript" || language === "typescript") return "node";
  if (stack.includes("fastapi") || stack.includes("django") || language === "python") return "python";
  if (stack.includes("laravel") || language === "php") return "php";
  if (language === "go" || language === "golang") return "go";
  return "generic";
}

export function resolveDeployTemplate(input: {
  provider: string;
  strategy: "vps" | "managed" | "static";
  primaryLanguage: string;
  techStack: string[];
  requestedTemplateId?: string;
}): DeployTemplate {
  if (input.requestedTemplateId) {
    const explicit = DEPLOY_TEMPLATES.find((template) => template.id === input.requestedTemplateId);
    if (explicit) return explicit;
  }

  const provider = input.provider.toLowerCase() === "gcp" ? "gcp" : "aws";
  const runtimeFamily = normalizeRuntimeFamily(input.primaryLanguage, input.techStack);

  return (
    DEPLOY_TEMPLATES.find(
      (template) =>
        template.provider === provider &&
        template.strategy === input.strategy &&
        (template.runtimeFamily === runtimeFamily || template.runtimeFamily === "generic"),
    ) ??
    DEPLOY_TEMPLATES.find((template) => template.provider === provider && template.strategy === input.strategy) ??
    DEPLOY_TEMPLATES[0]
  );
}
