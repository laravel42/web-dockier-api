/**
 * Single source of truth for valid service names.
 *
 * Both the Zod env schema (config.ts) and the TypeScript union (app.ts)
 * derive from this constant to prevent drift.
 */
export const SERVICE_NAMES = [
  "gateway",
  "auth",
  "users",
  "projects",
  "roles",
  "deploy",
  "commands",
  "processes",
  "network",
  "domains",
  "observe",
  "notifications",
  "integrations",
  "code-analysis",
  "git-integration",
  "image-builder",
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];
