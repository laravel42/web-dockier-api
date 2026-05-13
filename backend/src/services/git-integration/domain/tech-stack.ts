export interface TechStackItem {
  name: string;
  category: "language" | "framework" | "runtime" | "database" | "tool" | "infra";
  confidence: number;
}

const TECH_DETECTORS: Array<{ pattern: RegExp; tech: Omit<TechStackItem, "confidence"> & { confidence?: number } }> = [
  { pattern: /package\.json$/i, tech: { name: "Node.js", category: "runtime" } },
  { pattern: /tsconfig\.json$/i, tech: { name: "TypeScript", category: "language" } },
  { pattern: /requirements\.txt$/i, tech: { name: "Python", category: "language" } },
  { pattern: /Pipfile$/i, tech: { name: "Python", category: "language" } },
  { pattern: /pyproject\.toml$/i, tech: { name: "Python", category: "language" } },
  { pattern: /go\.mod$/i, tech: { name: "Go", category: "language" } },
  { pattern: /Cargo\.toml$/i, tech: { name: "Rust", category: "language" } },
  { pattern: /Gemfile$/i, tech: { name: "Ruby", category: "language" } },
  { pattern: /pom\.xml$/i, tech: { name: "Java", category: "language" } },
  { pattern: /build\.gradle/i, tech: { name: "Java", category: "language" } },
  { pattern: /\.csproj$/i, tech: { name: "C#/.NET", category: "language" } },
  { pattern: /composer\.json$/i, tech: { name: "PHP", category: "language" } },
  { pattern: /\.php$/i, tech: { name: "PHP", category: "language", confidence: 80 } },
  { pattern: /mix\.exs$/i, tech: { name: "Elixir", category: "language" } },
  { pattern: /artisan$/i, tech: { name: "Laravel", category: "framework" } },
  { pattern: /app\/Http\/Kernel\.php$/i, tech: { name: "Laravel", category: "framework" } },
  { pattern: /routes\/web\.php$/i, tech: { name: "Laravel", category: "framework", confidence: 95 } },
  { pattern: /config\/app\.php$/i, tech: { name: "Laravel", category: "framework", confidence: 85 } },
  { pattern: /symfony\.lock$/i, tech: { name: "Symfony", category: "framework" } },
  { pattern: /wp-config\.php$/i, tech: { name: "WordPress", category: "framework" } },
  { pattern: /next\.config\./i, tech: { name: "Next.js", category: "framework" } },
  { pattern: /nuxt\.config\./i, tech: { name: "Nuxt", category: "framework" } },
  { pattern: /vite\.config\./i, tech: { name: "Vite", category: "tool" } },
  { pattern: /angular\.json$/i, tech: { name: "Angular", category: "framework" } },
  { pattern: /svelte\.config\./i, tech: { name: "SvelteKit", category: "framework" } },
  { pattern: /remix\.config\./i, tech: { name: "Remix", category: "framework" } },
  { pattern: /astro\.config\./i, tech: { name: "Astro", category: "framework" } },
  { pattern: /manage\.py$/i, tech: { name: "Django", category: "framework" } },
  { pattern: /app\.py$/i, tech: { name: "Flask", category: "framework", confidence: 60 } },
  { pattern: /fastapi/i, tech: { name: "FastAPI", category: "framework", confidence: 60 } },
  { pattern: /config\/routes\.rb$/i, tech: { name: "Rails", category: "framework" } },
  { pattern: /prisma\/schema\.prisma$/i, tech: { name: "Prisma (PostgreSQL)", category: "database" } },
  { pattern: /drizzle\.config\./i, tech: { name: "Drizzle ORM", category: "database" } },
  { pattern: /\.sql$/i, tech: { name: "SQL Database", category: "database", confidence: 60 } },
  { pattern: /mongod/i, tech: { name: "MongoDB", category: "database", confidence: 50 } },
  { pattern: /redis/i, tech: { name: "Redis", category: "database", confidence: 50 } },
  { pattern: /Dockerfile$/i, tech: { name: "Docker", category: "infra" } },
  { pattern: /docker-compose/i, tech: { name: "Docker Compose", category: "infra" } },
  { pattern: /\.github\/workflows\//i, tech: { name: "GitHub Actions", category: "tool" } },
  { pattern: /\.gitlab-ci\.yml$/i, tech: { name: "GitLab CI", category: "tool" } },
  { pattern: /Jenkinsfile$/i, tech: { name: "Jenkins", category: "tool" } },
  { pattern: /terraform\//i, tech: { name: "Terraform", category: "infra" } },
];

export function detectTechStack(files: string[]): TechStackItem[] {
  const found = new Map<string, TechStackItem>();
  for (const file of files) {
    for (const detector of TECH_DETECTORS) {
      if (detector.pattern.test(file) && !found.has(detector.tech.name)) {
        found.set(detector.tech.name, {
          name: detector.tech.name,
          category: detector.tech.category,
          confidence: detector.tech.confidence ?? 90,
        });
      }
    }
  }

  const serverLangs = ["PHP", "Python", "Go", "Ruby", "Java", "Rust", "C#/.NET", "Elixir"];
  const hasServerLang = serverLangs.some((language) => found.has(language));
  if (hasServerLang && found.has("Node.js")) {
    const hasNodeBackend = files.some(
      (file) => /^(server|index|app)\.(js|ts|mjs)$/i.test(file) || /^src\/(server|index|app)\.(js|ts|mjs)$/i.test(file),
    );
    if (!hasNodeBackend) {
      found.set("Node.js", { name: "Node.js", category: "tool", confidence: 40 });
    }
  }

  return Array.from(found.values()).sort((a, b) => b.confidence - a.confidence);
}
