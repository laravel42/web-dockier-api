import type { RepoAnalysis } from "@/components/DeployWizard";

/**
 * Pre-built analysis data for template projects.
 * Used by useProjectAnalysis to skip the AI analysis step for known templates.
 */
export const TEMPLATE_ANALYSIS: Record<string, RepoAnalysis> = {
  wordpress: {
    techStack: [
      { name: "WordPress", category: "CMS", confidence: 1 },
      { name: "PHP", category: "Language", confidence: 1 },
      { name: "MySQL", category: "Database", confidence: 1 },
      { name: "Apache", category: "Server", confidence: 1 },
    ],
    deployOptions: [],
    detectedServices: [
      { type: "database", name: "MySQL", provider: "MySQL", confidence: 1 },
    ],
    repoSize: 0,
    primaryLanguage: "PHP",
    hasDocker: true,
    hasCi: false,
    aiAnalysis: {
      runtime: "php",
      runtimeVersion: "8.3",
      framework: "WordPress",
      frameworkVersion: "latest",
      buildCommand: "",
      startCommand: "apache2-foreground",
      port: 80,
      needsScheduler: false,
      needsQueueWorker: false,
      needsWebsockets: false,
      envVars: [
        "WORDPRESS_DB_HOST=host.docker.internal:3306",
        "WORDPRESS_DB_USER=wordpress",
        "WORDPRESS_DB_PASSWORD=wordpress",
        "WORDPRESS_DB_NAME=wordpress",
      ],
      nginxConfig: "reverse-proxy",
      summary: "WordPress CMS with MySQL database, served via Apache on port 80.",
    },
  },
};
