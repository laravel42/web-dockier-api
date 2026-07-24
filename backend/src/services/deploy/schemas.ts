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
  type: z.string(),
  name: z.string(),
  mode: serviceModeSchema,
});

export const envVarSchema = z.object({
  name: z.string(),
  value: z.string(),
});

