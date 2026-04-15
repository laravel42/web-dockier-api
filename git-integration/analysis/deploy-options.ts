import type { TechStackItem } from "./tech-stack";

export interface DeployOption {
  provider: string;
  type: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedMonthlyCost: string;
  bestFor: string;
}

/**
 * Suggest deploy options based on detected tech stack.
 * Currently supports AWS and GCP. To add a new provider,
 * add a new section following the same pattern below.
 */
export function suggestDeployOptions(tech: TechStackItem[], hasDocker: boolean, repoSize: number): DeployOption[] {
  const options: DeployOption[] = [];
  const names = new Set(tech.map(t => t.name));
  const techMap = new Map(tech.map(t => [t.name, t]));

  const nodeIsRuntime = techMap.get("Node.js")?.category === "runtime";
  const hasNode = names.has("Node.js") && nodeIsRuntime;
  const hasPHP = names.has("PHP");
  const isStatic = !hasNode && !hasPHP && !names.has("Python") && !names.has("Go") && !names.has("Ruby") && !names.has("Java") && !names.has("Rust") && !names.has("C#/.NET") && !names.has("Elixir");
  const hasNextjs = names.has("Next.js");
  const hasPython = names.has("Python") || names.has("Django") || names.has("FastAPI") || names.has("Flask");
  const hasK8s = names.has("Kubernetes");
  const hasBackend = hasNode || hasPython || hasPHP || names.has("Go") || names.has("Rust") || names.has("Java") || names.has("Ruby") || names.has("C#/.NET") || names.has("Elixir");

  // ─── AWS ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "AWS",
      type: "Elastic Beanstalk",
      description: "Managed platform that auto-handles capacity provisioning, load balancing, and deployment for Docker or native runtimes.",
      pros: ["Supports Docker, Node.js, Python, Java, Go, .NET, Ruby, PHP", "Auto-scaling & load balancing included", "Integrated with RDS, ElastiCache, S3", "No extra charge (pay for underlying EC2/RDS)"],
      cons: ["Complex AWS console & IAM setup", "Slower deployments than PaaS alternatives", "Debugging requires CloudWatch knowledge", "Opinionated environment configuration"],
      estimatedMonthlyCost: "$10 – $50/mo (single instance) | $50 – $200+/mo (load balanced)",
      bestFor: "Teams already on AWS, production workloads needing auto-scaling",
    });
    options.push({
      provider: "AWS",
      type: "ECS Fargate (Container)",
      description: "Serverless container orchestration — run Docker containers without managing servers.",
      pros: ["No server management (serverless containers)", "Fine-grained CPU/memory allocation", "Integrates with ALB, RDS, ECR, CloudWatch", "Scales to zero with Fargate Spot"],
      cons: ["Complex networking (VPC, subnets, security groups)", "Higher cost than EC2 for steady workloads", "Steep learning curve", "Cold starts on scale-from-zero"],
      estimatedMonthlyCost: "$15 – $70/mo (small) | $100 – $500+/mo (production)",
      bestFor: "Containerized microservices, variable traffic workloads",
    });
  }
  if (isStatic || names.has("Vite") || names.has("Astro") || hasNextjs) {
    options.push({
      provider: "AWS",
      type: "Amplify Hosting",
      description: "Managed hosting for static sites and SSR frameworks with CI/CD from Git.",
      pros: ["Git-based CI/CD", "SSR support for Next.js", "Global CDN (CloudFront)", "Free tier (1000 build minutes/mo)"],
      cons: ["Limited build customization", "Slower builds than alternatives", "AWS billing complexity"],
      estimatedMonthlyCost: "Free tier | $5 – $20/mo (typical)",
      bestFor: "Frontend apps on AWS, Next.js SSR on AWS",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 50000)) {
    options.push({
      provider: "AWS",
      type: "EKS (Kubernetes)",
      description: "Managed Kubernetes with deep AWS integration for large-scale container orchestration.",
      pros: ["Full Kubernetes API compatibility", "Deep AWS service integration", "Fargate mode (serverless nodes)", "Enterprise-grade security & compliance"],
      cons: ["$0.10/hr ($73/mo) control plane cost", "Complex setup & networking", "Requires Kubernetes expertise", "Expensive at small scale"],
      estimatedMonthlyCost: "$73/mo (control plane) + $50 – $300+/mo (nodes)",
      bestFor: "Enterprise Kubernetes, large-scale microservices",
    });
  }

  // ─── GCP ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "GCP",
      type: "Cloud Run (Container)",
      description: "Fully managed serverless container platform that scales to zero.",
      pros: ["Scales to zero (pay only when handling requests)", "No cluster management", "Built-in HTTPS & custom domains", "Integrates with Cloud SQL, Memorystore, Pub/Sub"],
      cons: ["Request timeout limits (60min max)", "Cold starts on scale-from-zero", "Less control than GKE", "Vendor lock-in on some features"],
      estimatedMonthlyCost: "Free tier generous | $5 – $50/mo (small) | $50 – $300+/mo (production)",
      bestFor: "Containerized APIs, event-driven workloads, cost-sensitive projects",
    });
    options.push({
      provider: "GCP",
      type: "Compute Engine (VPS)",
      description: "Flexible virtual machines with custom machine types and sustained-use discounts.",
      pros: ["Custom machine types (exact CPU/RAM)", "Sustained-use & committed-use discounts", "Preemptible/Spot VMs for batch workloads", "Full root access"],
      cons: ["Requires server management", "No auto-scaling without managed instance groups", "Complex networking (VPC, firewall rules)"],
      estimatedMonthlyCost: "$5 – $25/mo (e2-micro/small) | $50 – $200+/mo (production)",
      bestFor: "Custom workloads, long-running processes, GPU/ML workloads",
    });
  }
  if (isStatic || names.has("Vite") || names.has("Astro") || hasNextjs) {
    options.push({
      provider: "GCP",
      type: "Cloud Storage + CDN (Static)",
      description: "Host static sites on Cloud Storage with Cloud CDN for global distribution.",
      pros: ["Very low cost for static content", "Global CDN via Cloud CDN", "Integrates with Cloud Build for CI/CD", "99.95% availability SLA"],
      cons: ["No server-side rendering", "Requires Cloud Load Balancing for HTTPS", "More setup than dedicated static hosts"],
      estimatedMonthlyCost: "Free tier | $1 – $10/mo (typical)",
      bestFor: "Static sites, SPAs, documentation sites",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 50000)) {
    options.push({
      provider: "GCP",
      type: "GKE (Kubernetes)",
      description: "Managed Kubernetes with Autopilot mode for hands-off cluster management.",
      pros: ["Autopilot mode (fully managed nodes)", "Deep GCP service integration", "Multi-cluster support with Anthos", "Strong security (Workload Identity, Binary Authorization)"],
      cons: ["$0.10/hr ($73/mo) control plane cost (Standard)", "Complex setup for Standard mode", "Requires Kubernetes expertise"],
      estimatedMonthlyCost: "Autopilot: pay per pod | Standard: $73/mo + $50 – $300+/mo (nodes)",
      bestFor: "Enterprise Kubernetes, GCP-native microservices",
    });
  }

  // Fallback
  if (options.length === 0) {
    options.push({
      provider: "AWS",
      type: "EC2 (VPS)",
      description: "General-purpose cloud VPS with extensive service ecosystem.",
      pros: ["Massive service ecosystem", "Global regions", "Free tier available", "Flexible instance types"],
      cons: ["Complex pricing", "Requires IAM & networking knowledge"],
      estimatedMonthlyCost: "Free tier | $5 – $50/mo",
      bestFor: "General-purpose hosting",
    });
    options.push({
      provider: "GCP",
      type: "Cloud Run",
      description: "Serverless containers with generous free tier.",
      pros: ["Scales to zero", "Simple deployment", "Free tier available"],
      cons: ["Request timeout limits", "Cold starts"],
      estimatedMonthlyCost: "Free tier | $5 – $30/mo",
      bestFor: "Containerized workloads, cost-sensitive projects",
    });
  }

  return options;
}
