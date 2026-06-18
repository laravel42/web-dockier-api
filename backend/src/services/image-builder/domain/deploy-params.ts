/**
 * Deploy Parameters — Typed Schemas
 *
 * Defines Zod schemas for the deploy parameters passed to the image-builder
 * pipeline. Validates input at the API boundary and provides safe parsing
 * when reading back from the database.
 */

import { z } from "zod";

// ─── Environment Variable Schema ───────────────────────────────────

const envVarObjectSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

/**
 * Environment variables can be passed as objects or "KEY=VALUE" strings.
 * Both formats are accepted at the API boundary; downstream consumers
 * normalize them into { name, value } objects.
 */
const envVarItemSchema = z.union([
  envVarObjectSchema,
  z.string().min(1),
]);

// ─── Deploy Parameters Schema ──────────────────────────────────────

/**
 * Schema for deploy parameters accepted at the API boundary.
 *
 * All fields are optional — the deploy pipeline uses sensible defaults
 * when they're absent. Unknown keys are preserved (loose object) to allow
 * forward-compatible additions without breaking older clients.
 */
export const deployParamsSchema = z.looseObject({
  /** EC2 instance type (e.g. "t3.small", "t3.medium"). Defaults to "t3.small". */
  instanceType: z.string().min(1).optional(),
  /** Environment variables for the deployed container. */
  envVars: z.array(envVarItemSchema).optional(),
  /** Self-hosted services to provision alongside the container (e.g. "postgres", "redis"). */
  selfHostedServices: z.array(z.string().min(1)).optional(),
  /** Detected tech stack items (e.g. "node", "react", "tailwind"). */
  techStack: z.array(z.string().min(1)).optional(),
  /** Whether to use the repository's existing Dockerfile instead of generating one. */
  useRepoDockerfile: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
  /** Container port override (typically injected by the pipeline, not user-provided). */
  containerPort: z.union([z.number().int().positive(), z.string()]).optional(),
});

export type DeployParams = z.infer<typeof deployParamsSchema>;

// ─── Build Metadata Schema ─────────────────────────────────────────

/**
 * Schema for the `build_metadata` JSON field stored in the `builds` table.
 *
 * Used for safe parsing on retrieval — unknown fields are preserved via
 * looseObject since dynamic deploy params are also spread into metadata.
 */
export const buildMetadataSchema = z.looseObject({
  /** Inferred runtime (e.g. "node", "php", "python", "go"). */
  runtime: z.string().optional(),
  /** Container port as string (e.g. "3000"). */
  containerPort: z.string().optional(),
  /** Deploy target (e.g. "ecs", "ec2", "s3"). */
  deployTarget: z.string().optional(),
  /** Stringified JSON of deploy parameters. */
  deployParams: z.string().optional(),
  /** Buildspec YAML preview. */
  buildspecPreview: z.string().optional(),
  /** Deployed application URL (set after successful deploy). */
  appUrl: z.string().optional(),
  /** CloudFormation stack name (set after successful deploy). */
  stackName: z.string().optional(),
  /** Image URI resolved during deploy. */
  imageUri: z.string().optional(),
});

export type ParsedBuildMetadata = z.infer<typeof buildMetadataSchema>;

// ─── Parsing Helpers ───────────────────────────────────────────────

/**
 * Safely parse raw build_metadata from the database.
 * Returns a typed object or an empty metadata object on failure.
 */
export function parseBuildMetadata(raw: string | null | undefined): ParsedBuildMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return buildMetadataSchema.parse(parsed);
  } catch {
    return {};
  }
}

/**
 * Extract and parse the nested deployParams from build metadata.
 * Handles both string (JSON-encoded) and object formats.
 */
export function parseDeployParamsFromMetadata(metadata: ParsedBuildMetadata): DeployParams {
  const raw = metadata.deployParams;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return deployParamsSchema.parse(parsed);
    } catch {
      return {};
    }
  }
  return {};
}
