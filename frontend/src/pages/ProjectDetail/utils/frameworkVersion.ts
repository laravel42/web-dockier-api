import type { Dependency, RepoAnalysis } from "@/components/DeployWizard";
import type { Project } from "@/types";

/** Platform slug → dependency names that carry the framework version. */
const PLATFORM_PACKAGE_NAMES: Record<string, string[]> = {
  astro: ["astro"],
  nextjs: ["next"],
  nuxt: ["nuxt"],
  angular: ["@angular/core"],
  svelte: ["svelte"],
  sveltekit: ["@sveltejs/kit", "svelte"],
  remix: ["@remix-run/node", "remix", "@remix-run/react"],
  express: ["express"],
  fastify: ["fastify"],
  hono: ["hono"],
  nestjs: ["@nestjs/core"],
  gatsby: ["gatsby"],
  laravel: ["laravel/framework"],
  symfony: ["symfony/framework-bundle"],
  django: ["django"],
  flask: ["flask"],
  rails: ["rails"],
};

function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, "").split(" ")[0]?.trim() ?? "";
}

function versionFromDependencies(platform: string, dependencies?: Dependency[]): string | undefined {
  if (!dependencies?.length) return undefined;
  const candidates = PLATFORM_PACKAGE_NAMES[platform] ?? [platform];
  for (const pkg of candidates) {
    const dep = dependencies.find((d) => d.name === pkg);
    if (dep?.version) {
      const cleaned = cleanVersion(dep.version);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

/** Best available framework package version for a project. */
export function resolveFrameworkVersion(
  project: Project,
  analysis?: RepoAnalysis | null,
): string | undefined {
  const fromSettings = project.settings?.frameworkVersion?.trim();
  if (fromSettings) return fromSettings;

  const fromAi = analysis?.aiAnalysis?.frameworkVersion?.trim();
  if (fromAi) return fromAi;

  if (project.platform) {
    return versionFromDependencies(project.platform, analysis?.dependencies);
  }

  return undefined;
}
