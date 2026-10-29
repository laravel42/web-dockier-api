import { z } from "zod";

export const projectConfigSchema = z.object({
  overviewBlocks: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const projectSettingsSchema = z.object({
  color: z.string().max(50).optional(),
  avatar: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  frameworkVersion: z.string().max(50).optional(),
  rootDirectory: z.string().max(500).optional(),
  webDirectory: z.string().max(500).optional(),
  deployScript: z.string().max(50_000).optional(),
  pushToDeploy: z.boolean().optional(),
  healthCheckEnabled: z.boolean().optional(),
  healthCheckUrl: z.string().url().max(500).optional(),
  /**
   * Docker Compose deploy configuration.
   *
   * The USER'S CHOICES live here, not in dokploy_composes: they must survive a
   * redeploy, a rollback and a teardown, and be editable from project settings
   * without running a deploy. Same class of value as `rootDirectory` above.
   * The Dokploy resource ids are reconcilable state and live in the mapping
   * table instead.
   *
   * `entryService` is the service a domain routes to and `entryPort` the
   * container port it listens on. Both are optional because the analyzer
   * resolves a default for most repos, and a wrong guess here is a silent Bad
   * Gateway — so the deploy asks rather than inventing one.
   */
  compose: z.object({
    path: z.string().max(500),
    entryService: z.string().max(200).optional(),
    entryPort: z.number().int().min(1).max(65535).optional(),
  }).optional(),
}).passthrough();

export const infraStateSchema = z.enum(["none", "live", "torn_down"]);

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  repository: z.string(),
  branch: z.string(),
  connectionId: z.string(),
  platform: z.string(),
  sourceType: z.string(),
  template: z.string(),
  config: projectConfigSchema,
  settings: projectSettingsSchema,
  infraState: infraStateSchema.default("none"),
  lastCommitHash: z.string(),
  createdAt: z.string(),
});

// ─── Tags ──────────────────────────────────────────────────────────

export const tagResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
});
