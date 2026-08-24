import { z } from "zod";

export const providerSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  label: z.string(),
  region: z.string(),
  createdAt: z.string(),
});

export const deploymentStatusSchema = z.enum(["pending", "building", "deploying", "success", "failed", "destroyed", "cancelled"]);

export const deploymentSchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  gitConnectionId: z.union([z.uuid(), z.literal("")]),
  projectId: z.uuid(),
  projectName: z.string(),
  repo: z.string(),
  branch: z.string(),
  status: deploymentStatusSchema,
  logs: z.string(),
  appUrl: z.string(),
  commitHash: z.string(),
  dockerImage: z.string(),
  deployStrategy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const serviceModeSchema = z.enum(["vps", "managed"]);

export const serviceEntrySchema = z.object({
  type: z.string().max(100),
  name: z.string().max(100),
  mode: serviceModeSchema,
});

export const envVarSchema = z.object({
  name: z.string().max(256),
  value: z.string().max(10_000),
});


// ─── Dockerfile Preview (Phase 2) ──────────────────────────────────

export const dockerfilePreviewRequestSchema = z.object({
  gitConnectionId: z.union([z.uuid(), z.literal("")]),
  repo: z.string().min(1).max(300),
  branch: z.string().min(1).max(200),
  projectId: z.string().max(100).optional(),
  useRepoDockerfile: z.boolean().optional(),
});

export const dockerfileChangeSchema = z.object({
  what: z.string(),
  why: z.string(),
});

export const dockerfilePreviewResponseSchema = z.object({
  aiEnabled: z.boolean(),
  source: z.enum(["generated", "repo"]),
  mechanicalDockerfile: z.string(),
  finalDockerfile: z.string(),
  revised: z.boolean(),
  changes: z.array(dockerfileChangeSchema),
  skipReason: z.string().optional(),
  runtime: z.string(),
  framework: z.string(),
});
