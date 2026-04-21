import { api } from "encore.dev/api";
import { db } from "../shared";

interface TechBadge {
  name: string;
  category: string;
  confidence: number;
}

/**
 * Returns tech badges from stack_cache (specfy analyser) first, falls back to analysis_cache.
 * No external API calls — returns empty if neither cache has data.
 */
export const getRepoBadges = api(
  { method: "GET", path: "/git/repo-badges", auth: true },
  async (params: { repo: string; branch?: string; connectionId?: string }): Promise<{ badges: TechBadge[] }> => {
    const branch = params.branch || "main";

    // 1. Try stack_cache first (from @specfy/stack-analyser)
    try {
      const cached = await db.queryRow<{ result: string }>`
        SELECT result FROM stack_cache WHERE repo = ${params.repo} AND branch = ${branch}`;
      if (cached) {
        const parsed = typeof cached.result === "string" ? JSON.parse(cached.result) : cached.result;
        const components: Array<{ techs: string[] }> = parsed.components || [];
        // Collect all unique techs across components
        const techSet = new Set<string>();
        for (const c of components) {
          for (const t of c.techs || []) techSet.add(t);
        }
        if (techSet.size > 0) {
          const badges: TechBadge[] = Array.from(techSet)
            .map(name => ({
              name: formatTechName(name),
              category: "framework" as const,
              confidence: 90,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return { badges };
        }
      }
    } catch { /* ignore */ }

    // 2. Fallback to analysis_cache
    try {
      const cached = await db.queryRow<{ result: string }>`
        SELECT result FROM analysis_cache WHERE repo = ${params.repo} AND branch = ${branch}`;
      if (cached) {
        const parsed = typeof cached.result === "string" ? JSON.parse(cached.result) : cached.result;
        const techStack: TechBadge[] = parsed.techStack || [];
        const badges = techStack.filter(
          (t) => t.confidence >= 70 && t.category !== "database"
        );
        return { badges };
      }
    } catch { /* ignore */ }

    return { badges: [] };
  }
);

/** Capitalize tech names from specfy (e.g. "nodejs" → "Node.js", "react" → "React") */
function formatTechName(raw: string): string {
  const MAP: Record<string, string> = {
    nodejs: "Node.js", typescript: "TypeScript", javascript: "JavaScript",
    react: "React", vue: "Vue", angular: "Angular", svelte: "Svelte",
    nextjs: "Next.js", nuxt: "Nuxt", astro: "Astro", remix: "Remix",
    tailwindcss: "Tailwind CSS", tailwind: "Tailwind CSS",
    laravel: "Laravel", symfony: "Symfony", wordpress: "WordPress",
    django: "Django", flask: "Flask", fastapi: "FastAPI",
    rails: "Rails", spring: "Spring", express: "Express",
    fastify: "Fastify", nestjs: "NestJS", prisma: "Prisma",
    docker: "Docker", postgresql: "PostgreSQL", mysql: "MySQL",
    redis: "Redis", mongodb: "MongoDB", elasticsearch: "Elasticsearch",
    graphql: "GraphQL", grpc: "gRPC",
    php: "PHP", python: "Python", ruby: "Ruby", rust: "Rust", go: "Go",
    java: "Java", kotlin: "Kotlin", swift: "Swift", dart: "Dart",
    html: "HTML", css: "CSS", scss: "SCSS", sass: "Sass",
    vite: "Vite", webpack: "Webpack", eslint: "ESLint", prettier: "Prettier",
    terraform: "Terraform", vercel: "Vercel", netlify: "Netlify",
    datadog: "Datadog", sentry: "Sentry",
    livewire: "Livewire", inertia: "Inertia.js", alpine: "Alpine.js",
    "twill-cms": "Twill CMS", filament: "Filament",
    shadcn: "Shadcn", radixui: "Radix UI", lucideicons: "Lucide Icons",
    reactrouterdom: "React Router", stripe: "Stripe",
    phpcomposer: "Composer", phpunit: "PHPUnit",
    pnpm: "pnpm", nvm: "nvm", jsx: "JSX",
    openapi: "OpenAPI", jest: "Jest", bash: "Bash", hono: "Hono",
    nestjs: "NestJS", drizzle: "Drizzle ORM",
  };
  return MAP[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
}
