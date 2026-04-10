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

export function suggestDeployOptions(tech: TechStackItem[], hasDocker: boolean, repoSize: number): DeployOption[] {
  const options: DeployOption[] = [];
  const names = new Set(tech.map(t => t.name));
  const techMap = new Map(tech.map(t => [t.name, t]));

  // Node.js counts as a real runtime only if it's not downgraded to a tool
  const nodeIsRuntime = techMap.get("Node.js")?.category === "runtime";
  const hasNode = names.has("Node.js") && nodeIsRuntime;
  const hasPHP = names.has("PHP");
  const hasLaravel = names.has("Laravel");
  const hasWordPress = names.has("WordPress");
  const hasSymfony = names.has("Symfony");
  const hasPHPFramework = hasLaravel || hasWordPress || hasSymfony || names.has("Craft CMS") || names.has("Statamic") || names.has("Twill CMS");
  const isStatic = !hasNode && !hasPHP && !names.has("Python") && !names.has("Go") && !names.has("Ruby") && !names.has("Java") && !names.has("Rust") && !names.has("C#/.NET") && !names.has("Elixir");
  const hasNextjs = names.has("Next.js");
  const hasPython = names.has("Python") || names.has("Django") || names.has("FastAPI") || names.has("Flask");
  const hasEncore = names.has("Encore.ts");
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
      cons: ["Limited build customization", "Slower builds than Vercel/Netlify", "AWS billing complexity", "Less community than Vercel"],
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

  // ─── DigitalOcean ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "DigitalOcean",
      type: "App Platform (Container)",
      description: "Managed PaaS that builds and runs containers from Git with auto-scaling and managed databases.",
      pros: ["Deploy from GitHub/GitLab in clicks", "Built-in managed databases (Postgres, Redis, MySQL)", "Auto-scaling & zero-downtime deploys", "Predictable pricing"],
      cons: ["Less flexible than raw droplets", "Limited regions (8)", "No GPU instances", "Smaller ecosystem than AWS"],
      estimatedMonthlyCost: "$5 – $25/mo (basic) | $25 – $100+/mo (production)",
      bestFor: "Full-stack apps, startups wanting simplicity",
    });
    options.push({
      provider: "DigitalOcean",
      type: "VPS (Droplet)",
      description: "Flexible VPS with predictable pricing — run Docker, K8s, or bare metal.",
      pros: ["Predictable pricing ($4/mo for 512MB)", "Full root access", "Managed databases available", "Good documentation & community"],
      cons: ["Requires server management", "No auto-scaling on basic droplets", "Manual SSL/load balancer setup"],
      estimatedMonthlyCost: "$4 – $12/mo (basic) | $24 – $96/mo (production)",
      bestFor: "Budget-friendly Docker hosting, self-managed servers",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 50000)) {
    options.push({
      provider: "DigitalOcean",
      type: "Managed Kubernetes (DOKS)",
      description: "Managed K8s cluster with simple pricing and integrated container registry.",
      pros: ["Free control plane", "Simple pricing ($12/mo per node)", "Integrated container registry", "1-click marketplace apps"],
      cons: ["Smaller node options than AWS/GCP", "Less enterprise features", "Limited regions"],
      estimatedMonthlyCost: "$12 – $48/mo (per node)",
      bestFor: "Small-to-medium K8s workloads",
    });
  }

  // ─── Hetzner ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Hetzner",
      type: "Cloud Server (VPS)",
      description: "Best price-to-performance VPS in Europe — run Docker containers with full control.",
      pros: ["Cheapest VPS (€3.29/mo for 2GB RAM)", "Excellent performance per dollar", "EU data centers (GDPR friendly)", "ARM64 options available"],
      cons: ["No managed PaaS / app platform", "Requires server administration", "Limited US presence (only Ashburn)", "No managed container service"],
      estimatedMonthlyCost: "€3.29 – €10/mo (VPS) | €40+/mo (dedicated)",
      bestFor: "Cost-optimized European hosting, self-managed Docker",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 30000)) {
    options.push({
      provider: "Hetzner",
      type: "Managed Kubernetes (K8s)",
      description: "Affordable managed Kubernetes with Hetzner's price-performance advantage.",
      pros: ["Cheapest managed K8s available", "Free control plane", "Hetzner Cloud integration", "EU data centers"],
      cons: ["Smaller ecosystem", "Limited regions", "Less enterprise tooling", "Community-driven support"],
      estimatedMonthlyCost: "€3.29+/mo (per node)",
      bestFor: "Budget Kubernetes in Europe",
    });
  }

  // ─── Vultr ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Vultr",
      type: "Cloud Compute / Container",
      description: "High-performance cloud VPS with Kubernetes and container registry support.",
      pros: ["Competitive pricing ($2.50/mo entry)", "32 global locations", "Managed Kubernetes available", "Bare metal & GPU options"],
      cons: ["Smaller community than DO/AWS", "No managed PaaS", "Requires server management", "Support can be slow"],
      estimatedMonthlyCost: "$2.50 – $12/mo (VPS) | $20+/mo (K8s)",
      bestFor: "Global presence on a budget, GPU workloads",
    });
  }

  // ─── Linode (Akamai) ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Linode",
      type: "Cloud Instance / LKE",
      description: "Reliable cloud VPS with managed Kubernetes (LKE) and Akamai CDN integration.",
      pros: ["Predictable pricing ($5/mo for 1GB)", "Free managed Kubernetes control plane", "Akamai CDN integration", "Good support reputation"],
      cons: ["No managed PaaS", "Smaller marketplace than AWS/DO", "Requires server management", "Fewer managed database options"],
      estimatedMonthlyCost: "$5 – $12/mo (VPS) | $12+/mo (LKE node)",
      bestFor: "Reliable VPS hosting, Kubernetes with CDN",
    });
  }

  // ─── UpCloud ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "UpCloud",
      type: "Cloud Server",
      description: "High-performance European cloud with MaxIOPS storage and managed databases.",
      pros: ["MaxIOPS storage (fast I/O)", "EU & US data centers", "Managed databases (Postgres, MySQL, Redis)", "100% uptime SLA"],
      cons: ["No managed container service", "Smaller community", "Requires server management", "Higher entry price than Hetzner"],
      estimatedMonthlyCost: "$5 – $20/mo (VPS) | $30+/mo (production)",
      bestFor: "I/O-intensive workloads, European hosting",
    });
  }

  // ─── Hostinger ───
  if (hasBackend || hasDocker || isStatic) {
    options.push({
      provider: "Hostinger",
      type: "VPS / Cloud Hosting",
      description: "Budget-friendly VPS and managed hosting with global data centers.",
      pros: ["Very affordable ($3.99/mo VPS)", "Managed WordPress hosting", "Global data centers", "Easy control panel"],
      cons: ["Limited advanced features", "No managed containers or K8s", "Shared hosting limitations", "Less developer-focused"],
      estimatedMonthlyCost: "$3.99 – $12/mo (VPS) | $16+/mo (cloud)",
      bestFor: "Budget hosting, WordPress, small projects",
    });
  }

  // ─── Katapult ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Katapult",
      type: "Cloud VM",
      description: "Developer-focused cloud with API-first approach and fast VM provisioning.",
      pros: ["Fast VM provisioning (<60s)", "API-first design", "Simple pricing", "UK & EU data centers"],
      cons: ["Smaller provider", "Limited regions", "No managed K8s or PaaS", "Smaller community"],
      estimatedMonthlyCost: "$5 – $20/mo (VM)",
      bestFor: "API-driven infrastructure, UK/EU hosting",
    });
  }

  // ─── Static / Edge (Vercel, Netlify, Cloudflare) ───
  if (isStatic || names.has("Vite") || names.has("Astro")) {
    options.push({
      provider: "Vercel",
      type: "Static / Edge",
      description: "Optimized for frontend frameworks with edge CDN, instant rollbacks, and preview deployments.",
      pros: ["Free tier generous (100GB bandwidth)", "Automatic HTTPS & CDN", "Preview deploys per PR", "Zero config for Vite/Next/Astro"],
      cons: ["Serverless functions have cold starts", "Vendor lock-in on edge functions", "100GB bandwidth limit on free tier"],
      estimatedMonthlyCost: "Free – $20/mo (Pro)",
      bestFor: "Frontend apps, marketing sites, JAMstack",
    });
    options.push({
      provider: "Netlify",
      type: "Static / Edge",
      description: "Similar to Vercel with built-in forms, identity, and serverless functions.",
      pros: ["Free tier with 100GB bandwidth", "Built-in form handling", "Split testing built-in", "Plugin ecosystem"],
      cons: ["Build minutes limited (300/mo free)", "Serverless functions limited to 10s execution", "Less optimized for SSR than Vercel"],
      estimatedMonthlyCost: "Free – $19/mo (Pro)",
      bestFor: "Static sites, blogs, marketing pages",
    });
    options.push({
      provider: "Cloudflare Pages",
      type: "Static / Edge",
      description: "Unlimited bandwidth on free tier with Workers for edge compute.",
      pros: ["Unlimited bandwidth (free)", "Global edge network (300+ cities)", "Workers for server logic", "Fast builds"],
      cons: ["Workers have 10ms CPU limit (free)", "Less framework-specific optimizations", "Smaller ecosystem than Vercel/Netlify"],
      estimatedMonthlyCost: "Free – $5/mo (Workers paid)",
      bestFor: "High-traffic static sites, cost-sensitive projects",
    });
  }

  // ─── Next.js specific ───
  if (hasNextjs) {
    options.push({
      provider: "Vercel",
      type: "Serverless + Edge",
      description: "First-party hosting for Next.js with ISR, edge middleware, and image optimization.",
      pros: ["Best Next.js support (built by same team)", "ISR & on-demand revalidation", "Edge middleware", "Automatic code splitting"],
      cons: ["Can get expensive at scale ($20/seat)", "Vendor lock-in for some features", "Serverless cold starts on free tier"],
      estimatedMonthlyCost: "$0 – $20/mo per seat (Pro)",
      bestFor: "Next.js apps of any size",
    });
  }

  // ─── PaaS (Railway, Render, Fly.io) ───
  if (hasNode && !isStatic) {
    options.push({
      provider: "Railway",
      type: "PaaS (Container)",
      description: "Simple container hosting with built-in PostgreSQL, Redis, and auto-scaling.",
      pros: ["Deploy from GitHub in seconds", "Built-in databases (Postgres, Redis, MySQL)", "Usage-based pricing", "Private networking between services"],
      cons: ["No free tier (trial $5 credit)", "Less control than VPS", "Smaller community than Heroku"],
      estimatedMonthlyCost: "$5 – $20/mo (hobby) | $20+/mo (production)",
      bestFor: "Full-stack Node.js apps with databases",
    });
    options.push({
      provider: "Render",
      type: "PaaS (Container)",
      description: "Heroku alternative with free tier, auto-deploy from Git, and managed databases.",
      pros: ["Free tier for web services", "Auto-deploy from Git", "Managed PostgreSQL & Redis", "Built-in cron jobs"],
      cons: ["Free tier spins down after 15min inactivity", "Limited to 750 hours/mo free", "Slower builds than Railway"],
      estimatedMonthlyCost: "Free – $7/mo (Starter) | $25+/mo (Pro)",
      bestFor: "Side projects, startups, Heroku migration",
    });
    options.push({
      provider: "Fly.io",
      type: "Container (Edge)",
      description: "Run containers close to users globally with built-in Postgres and Upstash Redis.",
      pros: ["Global edge deployment", "Built-in Postgres (Fly Postgres)", "Generous free tier (3 shared VMs)", "WebSocket & long-running process support"],
      cons: ["More complex setup than Railway/Render", "Postgres is user-managed", "Debugging can be harder"],
      estimatedMonthlyCost: "Free – $5/mo (per VM) | $30+/mo (production)",
      bestFor: "Latency-sensitive apps, global user base",
    });
  }

  // ─── Python PaaS ───
  if (hasPython) {
    options.push({
      provider: "Railway",
      type: "PaaS (Container)",
      description: "One-click Python deployment with built-in databases and environment management.",
      pros: ["Auto-detects Python/Django/FastAPI", "Built-in PostgreSQL", "Usage-based pricing", "Easy environment variables"],
      cons: ["No free tier", "Less Python-specific tooling", "Limited cron on hobby plan"],
      estimatedMonthlyCost: "$5 – $20/mo (hobby) | $20+/mo (production)",
      bestFor: "Django, FastAPI, Flask apps",
    });
    options.push({
      provider: "Render",
      type: "PaaS (Container)",
      description: "Free tier Python hosting with managed databases and background workers.",
      pros: ["Free tier available", "Native Python buildpack", "Background workers support", "Managed PostgreSQL"],
      cons: ["Free tier sleeps after inactivity", "Slower cold starts", "Limited compute on free tier"],
      estimatedMonthlyCost: "Free – $7/mo (Starter) | $25+/mo (Pro)",
      bestFor: "Python APIs, Django apps, data services",
    });
  }

  // ─── PHP / Laravel PaaS ───
  if (hasPHP || hasPHPFramework) {
    if (hasLaravel || hasPHPFramework) {
      options.push({
        provider: "Railway",
        type: "PaaS (Container)",
        description: "One-click Laravel/PHP deployment with built-in MySQL, PostgreSQL, and Redis.",
        pros: ["Auto-detects PHP/Laravel", "Built-in MySQL & PostgreSQL", "Usage-based pricing", "Easy environment variables & queues"],
        cons: ["No free tier (trial $5 credit)", "Less PHP-specific tooling than Laravel Forge", "Limited cron on hobby plan"],
        estimatedMonthlyCost: "$5 – $20/mo (hobby) | $20+/mo (production)",
        bestFor: "Laravel, Symfony, PHP apps with databases",
      });
      options.push({
        provider: "Render",
        type: "PaaS (Container)",
        description: "Docker-based PHP hosting with managed databases and background workers.",
        pros: ["Free tier available", "Docker-based PHP support", "Managed PostgreSQL & Redis", "Background workers for queues"],
        cons: ["Free tier sleeps after inactivity", "PHP needs Docker config", "Slower cold starts"],
        estimatedMonthlyCost: "Free – $7/mo (Starter) | $25+/mo (Pro)",
        bestFor: "Laravel APIs, PHP microservices",
      });
      options.push({
        provider: "Fly.io",
        type: "Container (Edge)",
        description: "Run PHP/Laravel containers close to users globally with built-in Postgres.",
        pros: ["Global edge deployment", "Built-in Postgres (Fly Postgres)", "Generous free tier (3 shared VMs)", "Great for Laravel with queues"],
        cons: ["Requires Dockerfile", "Postgres is user-managed", "More complex setup"],
        estimatedMonthlyCost: "Free – $5/mo (per VM) | $30+/mo (production)",
        bestFor: "Latency-sensitive Laravel apps, global user base",
      });
    }
    if (hasWordPress) {
      options.push({
        provider: "Hostinger",
        type: "Managed WordPress",
        description: "Optimized WordPress hosting with LiteSpeed, staging, and automatic updates.",
        pros: ["LiteSpeed web server (fast)", "1-click staging environment", "Automatic WordPress updates", "Free SSL & CDN"],
        cons: ["Limited to WordPress", "Shared resources on lower plans", "Less developer control"],
        estimatedMonthlyCost: "$2.99 – $11.99/mo",
        bestFor: "WordPress sites, blogs, WooCommerce",
      });
    }
  }

  // ─── Encore.ts ───
  if (hasEncore) {
    options.push({
      provider: "Encore Cloud",
      type: "PaaS (Managed)",
      description: "Native hosting for Encore.ts apps with automatic infrastructure provisioning.",
      pros: ["Zero-config deployment", "Auto-provisions databases & pub/sub", "Built-in tracing & monitoring", "Preview environments per PR"],
      cons: ["Encore-specific (vendor lock-in)", "Limited to Encore framework", "Pricing scales with usage"],
      estimatedMonthlyCost: "Free (dev) | $50+/mo (production on AWS/GCP)",
      bestFor: "Encore.ts microservices",
    });
  }

  // Fallback
  if (options.length === 0) {
    options.push({
      provider: "DigitalOcean",
      type: "VPS",
      description: "General-purpose cloud VPS with predictable pricing.",
      pros: ["Simple pricing", "Good documentation", "Managed databases available", "Global data centers"],
      cons: ["Requires server management", "No auto-scaling on basic droplets"],
      estimatedMonthlyCost: "$4 – $24/mo",
      bestFor: "General-purpose hosting",
    });
    options.push({
      provider: "Hetzner",
      type: "VPS",
      description: "Best value VPS hosting in Europe.",
      pros: ["Cheapest VPS available", "Great performance", "EU data centers"],
      cons: ["Requires server management", "Limited US presence"],
      estimatedMonthlyCost: "€3.29 – €10/mo",
      bestFor: "Budget hosting",
    });
  }

  return options;
}
