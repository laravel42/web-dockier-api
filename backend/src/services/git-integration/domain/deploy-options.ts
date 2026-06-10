import type { TechStackItem } from "./tech-stack.js";

export interface DeployOption {
  provider: string;
  type: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedMonthlyCost: string;
  bestFor: string;
}

export function suggestDeployOptions(tech: TechStackItem[], hasDocker: boolean, repoSize: number): DeployOption[] {
  const options: DeployOption[] = [];
  const names = new Set(tech.map((item) => item.name));
  const techMap = new Map(tech.map((item) => [item.name, item]));

  const nodeIsRuntime = techMap.get("Node.js")?.category === "runtime";
  const hasNode = names.has("Node.js") && nodeIsRuntime;
  const hasPHP = names.has("PHP");
  const hasPython = names.has("Python") || names.has("Django") || names.has("FastAPI") || names.has("Flask");
  const hasK8s = names.has("Kubernetes");
  const hasBackend = hasNode || hasPython || hasPHP || names.has("Go") || names.has("Rust") || names.has("Java") || names.has("Ruby");
  const isStatic = !hasBackend;

  if (hasBackend || hasDocker) {
    options.push({
      provider: "AWS",
      type: "Elastic Beanstalk",
      description: "Managed platform with scaling and load balancing.",
      pros: ["Supports common runtimes", "Managed infra"],
      cons: ["AWS complexity", "Slower than PaaS alternatives"],
      estimatedMonthlyCost: "$10-$200+",
      bestFor: "Teams already on AWS",
    });
    options.push({
      provider: "AWS",
      type: "ECS Fargate",
      description: "Serverless containers without managing EC2.",
      pros: ["No server management", "Fine-grained sizing"],
      cons: ["VPC/network complexity", "Can be pricier for steady traffic"],
      estimatedMonthlyCost: "$15-$500+",
      bestFor: "Containerized APIs and services",
    });
    options.push({
      provider: "GCP",
      type: "Cloud Run",
      description: "Serverless containers that scale to zero.",
      pros: ["Scale to zero", "Simple operations"],
      cons: ["Cold starts", "Platform limits"],
      estimatedMonthlyCost: "Free tier to $300+",
      bestFor: "Variable traffic workloads",
    });
  }

  if (isStatic || names.has("Vite") || names.has("Astro") || names.has("Next.js")) {
    options.push({
      provider: "AWS",
      type: "Amplify Hosting",
      description: "Managed frontend and SSR hosting.",
      pros: ["Git CI/CD", "CDN included"],
      cons: ["Limited customization"],
      estimatedMonthlyCost: "Free tier to $20+",
      bestFor: "Frontend-heavy repos",
    });
    options.push({
      provider: "GCP",
      type: "Cloud Storage + CDN",
      description: "Low-cost static hosting with global distribution.",
      pros: ["Very cheap static hosting", "Global CDN"],
      cons: ["No native SSR runtime"],
      estimatedMonthlyCost: "$1-$10+",
      bestFor: "Static sites and docs",
    });
  }

  if (hasK8s || (hasDocker && repoSize > 50000)) {
    options.push({
      provider: "AWS",
      type: "EKS",
      description: "Managed Kubernetes on AWS.",
      pros: ["Kubernetes compatibility", "AWS ecosystem"],
      cons: ["Higher ops complexity", "Control-plane cost"],
      estimatedMonthlyCost: "$73+",
      bestFor: "Large containerized systems",
    });
    options.push({
      provider: "GCP",
      type: "GKE",
      description: "Managed Kubernetes on GCP.",
      pros: ["Autopilot mode", "Mature Kubernetes tooling"],
      cons: ["Kubernetes expertise needed"],
      estimatedMonthlyCost: "$73+",
      bestFor: "Enterprise Kubernetes workloads",
    });
  }

  if (options.length === 0) {
    options.push({
      provider: "AWS",
      type: "EC2",
      description: "General-purpose VPS option.",
      pros: ["Flexible", "Broad ecosystem"],
      cons: ["Manual operations"],
      estimatedMonthlyCost: "$5-$50+",
      bestFor: "Custom or experimental deployments",
    });
  }

  return options;
}
