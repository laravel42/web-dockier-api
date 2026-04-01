export interface TechStackItem {
  name: string;
  category: "language" | "framework" | "runtime" | "database" | "tool" | "infra";
  confidence: number; // 0-100
}

// File-pattern → tech stack detection rules
const TECH_DETECTORS: Array<{ pattern: RegExp; tech: Omit<TechStackItem, "confidence"> & { confidence?: number } }> = [
  // Languages
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
  // PHP Frameworks
  { pattern: /artisan$/i, tech: { name: "Laravel", category: "framework" } },
  { pattern: /app\/Http\/Kernel\.php$/i, tech: { name: "Laravel", category: "framework" } },
  { pattern: /routes\/web\.php$/i, tech: { name: "Laravel", category: "framework", confidence: 95 } },
  { pattern: /config\/app\.php$/i, tech: { name: "Laravel", category: "framework", confidence: 85 } },
  { pattern: /config\/twill\.php$/i, tech: { name: "Twill CMS", category: "framework" } },
  { pattern: /config\/twill-navigation\.php$/i, tech: { name: "Twill CMS", category: "framework" } },
  { pattern: /app\/Twill\//i, tech: { name: "Twill CMS", category: "framework", confidence: 95 } },
  { pattern: /symfony\.lock$/i, tech: { name: "Symfony", category: "framework" } },
  { pattern: /config\/bundles\.php$/i, tech: { name: "Symfony", category: "framework", confidence: 85 } },
  { pattern: /wp-config\.php$/i, tech: { name: "WordPress", category: "framework" } },
  { pattern: /wp-content\//i, tech: { name: "WordPress", category: "framework", confidence: 90 } },
  { pattern: /craft\/config\//i, tech: { name: "Craft CMS", category: "framework" } },
  { pattern: /config\/statamic\//i, tech: { name: "Statamic", category: "framework" } },
  { pattern: /config\/filament\.php$/i, tech: { name: "Filament", category: "framework" } },
  { pattern: /app\/Filament\//i, tech: { name: "Filament", category: "framework", confidence: 95 } },
  { pattern: /config\/livewire\.php$/i, tech: { name: "Livewire", category: "framework" } },
  { pattern: /resources\/views\/livewire\//i, tech: { name: "Livewire", category: "framework", confidence: 90 } },
  { pattern: /config\/inertia\.php$/i, tech: { name: "Inertia.js", category: "framework" } },
  // Laravel ecosystem packages
  { pattern: /config\/horizon\.php$/i, tech: { name: "Laravel Horizon", category: "tool" } },
  { pattern: /config\/octane\.php$/i, tech: { name: "Laravel Octane", category: "framework" } },
  { pattern: /config\/reverb\.php$/i, tech: { name: "Laravel Reverb", category: "framework" } },
  { pattern: /config\/telescope\.php$/i, tech: { name: "Laravel Telescope", category: "tool" } },
  { pattern: /config\/sanctum\.php$/i, tech: { name: "Laravel Sanctum", category: "tool" } },
  { pattern: /config\/passport\.php$/i, tech: { name: "Laravel Passport", category: "tool" } },
  { pattern: /config\/jetstream\.php$/i, tech: { name: "Jetstream", category: "framework" } },
  { pattern: /config\/breeze\.php$/i, tech: { name: "Breeze", category: "framework", confidence: 80 } },
  { pattern: /docker-compose\.yml$/i, tech: { name: "Docker Compose", category: "infra" } },
  { pattern: /docker-compose\.sail\.yml$/i, tech: { name: "Laravel Sail", category: "tool" } },
  { pattern: /config\/scout\.php$/i, tech: { name: "Laravel Scout", category: "tool" } },
  { pattern: /config\/broadcasting\.php$/i, tech: { name: "Broadcasting", category: "tool", confidence: 70 } },
  { pattern: /supervisor\.conf$/i, tech: { name: "Supervisor", category: "infra" } },
  { pattern: /supervisord\.conf$/i, tech: { name: "Supervisor", category: "infra" } },
  // JS/TS Frameworks
  { pattern: /next\.config\./i, tech: { name: "Next.js", category: "framework" } },
  { pattern: /nuxt\.config\./i, tech: { name: "Nuxt", category: "framework" } },
  { pattern: /vite\.config\./i, tech: { name: "Vite", category: "tool" } },
  { pattern: /angular\.json$/i, tech: { name: "Angular", category: "framework" } },
  { pattern: /svelte\.config\./i, tech: { name: "SvelteKit", category: "framework" } },
  { pattern: /remix\.config\./i, tech: { name: "Remix", category: "framework" } },
  { pattern: /astro\.config\./i, tech: { name: "Astro", category: "framework" } },
  // Python Frameworks
  { pattern: /manage\.py$/i, tech: { name: "Django", category: "framework" } },
  { pattern: /app\.py$/i, tech: { name: "Flask", category: "framework", confidence: 60 } },
  { pattern: /fastapi/i, tech: { name: "FastAPI", category: "framework", confidence: 60 } },
  // Ruby
  { pattern: /config\/routes\.rb$/i, tech: { name: "Rails", category: "framework" } },
  // Encore
  { pattern: /encore\.app$/i, tech: { name: "Encore.ts", category: "framework" } },
  // Databases
  { pattern: /prisma\/schema\.prisma$/i, tech: { name: "Prisma (PostgreSQL)", category: "database" } },
  { pattern: /drizzle\.config\./i, tech: { name: "Drizzle ORM", category: "database" } },
  { pattern: /\.sql$/i, tech: { name: "SQL Database", category: "database", confidence: 60 } },
  { pattern: /mongod/i, tech: { name: "MongoDB", category: "database", confidence: 50 } },
  { pattern: /redis/i, tech: { name: "Redis", category: "database", confidence: 50 } },
  // Infra / Tools
  { pattern: /Dockerfile$/i, tech: { name: "Docker", category: "infra" } },
  { pattern: /docker-compose/i, tech: { name: "Docker Compose", category: "infra" } },
  { pattern: /\.github\/workflows\//i, tech: { name: "GitHub Actions", category: "tool" } },
  { pattern: /\.gitlab-ci\.yml$/i, tech: { name: "GitLab CI", category: "tool" } },
  { pattern: /Jenkinsfile$/i, tech: { name: "Jenkins", category: "tool" } },
  { pattern: /terraform\//i, tech: { name: "Terraform", category: "infra" } },
  { pattern: /serverless\.yml$/i, tech: { name: "Serverless Framework", category: "infra" } },
  { pattern: /vercel\.json$/i, tech: { name: "Vercel", category: "infra" } },
  { pattern: /netlify\.toml$/i, tech: { name: "Netlify", category: "infra" } },
  { pattern: /fly\.toml$/i, tech: { name: "Fly.io", category: "infra" } },
  { pattern: /render\.yaml$/i, tech: { name: "Render", category: "infra" } },
  { pattern: /kubernetes|k8s/i, tech: { name: "Kubernetes", category: "infra" } },
  // PHP tools
  { pattern: /phpunit\.xml/i, tech: { name: "PHPUnit", category: "tool", confidence: 70 } },
  { pattern: /phpstan\.neon/i, tech: { name: "PHPStan", category: "tool", confidence: 70 } },
  { pattern: /\.env\.example$/i, tech: { name: "Env Config", category: "tool", confidence: 40 } },
  { pattern: /nginx\.conf/i, tech: { name: "Nginx", category: "infra", confidence: 70 } },
  { pattern: /\.htaccess$/i, tech: { name: "Apache", category: "infra", confidence: 70 } },
  // Additional PHP ecosystem
  { pattern: /config\/cashier\.php$/i, tech: { name: "Laravel Cashier", category: "tool" } },
  { pattern: /config\/nova\.php$/i, tech: { name: "Laravel Nova", category: "framework" } },
  { pattern: /config\/pulse\.php$/i, tech: { name: "Laravel Pulse", category: "tool" } },
  { pattern: /config\/pennant\.php$/i, tech: { name: "Laravel Pennant", category: "tool" } },
  { pattern: /config\/socialite\.php$/i, tech: { name: "Laravel Socialite", category: "tool" } },
  { pattern: /phpstan\.neon\.dist$/i, tech: { name: "PHPStan", category: "tool", confidence: 70 } },
  { pattern: /pint\.json$/i, tech: { name: "Laravel Pint", category: "tool", confidence: 60 } },
  { pattern: /rector\.php$/i, tech: { name: "Rector", category: "tool", confidence: 60 } },
  // Additional JS ecosystem
  { pattern: /tailwind\.config\./i, tech: { name: "Tailwind CSS", category: "tool" } },
  { pattern: /postcss\.config\./i, tech: { name: "PostCSS", category: "tool", confidence: 50 } },
  { pattern: /webpack\.config\./i, tech: { name: "Webpack", category: "tool" } },
  { pattern: /turbo\.json$/i, tech: { name: "Turborepo", category: "tool" } },
  { pattern: /pnpm-workspace\.yaml$/i, tech: { name: "pnpm", category: "tool", confidence: 60 } },
  { pattern: /\.nvmrc$/i, tech: { name: "nvm", category: "tool", confidence: 40 } },
  // Go ecosystem
  { pattern: /cmd\/.*\/main\.go$/i, tech: { name: "Go CLI", category: "tool", confidence: 60 } },
  { pattern: /internal\//i, tech: { name: "Go Modules", category: "tool", confidence: 40 } },
  // Rust ecosystem
  { pattern: /Rocket\.toml$/i, tech: { name: "Rocket", category: "framework" } },
  { pattern: /shuttle\.toml$/i, tech: { name: "Shuttle", category: "infra" } },
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

  // ── Context-aware adjustments ──
  // When a server-side language (PHP, Python, Ruby, Go, Java, etc.) is the primary backend,
  // Node.js from package.json is likely just for frontend asset tooling (npm/Vite/Webpack).
  // Downgrade Node.js to a tool with lower confidence so deploy options target the real runtime.
  const serverLangs = ["PHP", "Python", "Go", "Ruby", "Java", "Rust", "C#/.NET", "Elixir"];
  const hasServerLang = serverLangs.some(l => found.has(l));
  if (hasServerLang && found.has("Node.js")) {
    // Check if there's an actual Node.js backend (e.g. server.js, index.ts at root)
    const hasNodeBackend = files.some(f =>
      /^(server|index|app)\.(js|ts|mjs)$/i.test(f) ||
      /^src\/(server|index|app)\.(js|ts|mjs)$/i.test(f)
    );
    if (!hasNodeBackend) {
      found.set("Node.js", { name: "Node.js", category: "tool", confidence: 40 });
    }
  }

  // Vite in a PHP project is an asset bundler, not a framework
  const phpFrameworks = ["Laravel", "Symfony", "WordPress", "Craft CMS", "Statamic"];
  const hasPHPFramework = phpFrameworks.some(f => found.has(f));
  if (hasPHPFramework && found.has("Vite")) {
    found.set("Vite", { name: "Vite", category: "tool", confidence: 50 });
  }

  return Array.from(found.values()).sort((a, b) => b.confidence - a.confidence);
}
