import { z } from "zod";
import { bootstrapEnv } from "./env/load.js";
import { isSupabasePublishableKey, isSupabaseSecretKey } from "./supabase/keys.js";

const supabasePublishableKeySchema = z
  .string()
  .min(20)
  .refine(isSupabasePublishableKey, "Must be a Supabase publishable key (sb_publishable_...)");

const supabaseSecretKeySchema = z
  .string()
  .min(20)
  .refine(isSupabaseSecretKey, "Must be a Supabase secret key (sb_secret_...)");

const envSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    SERVICE_NAME: z
      .enum([
        "gateway",
        "auth",
        "users",
        "projects",
        "roles",
        "deploy",
        "notifications",
        "integrations",
        "code-analysis",
        "git-integration",
        "image-builder",
      ])
      .default("gateway"),
    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: supabasePublishableKeySchema,
    SUPABASE_SECRET_KEY: supabaseSecretKeySchema.optional(),
    /** @deprecated Use SUPABASE_SECRET_KEY (sb_secret_...) instead. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    JWT_SECRET: z.string().min(16),
    CORS_ORIGIN: z.string().default("*"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    WEBHOOK_SECRET: z.string().optional(),
    DEPLOY_CALLBACK_URL: z.string().optional(),
    IMAGE_BUILDER_CODEBUILD_PROJECT: z.string().min(1).default("image-builder"),
    PGBOSS_MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),
    SONARQUBE_URL: z.string().url().optional(),
    SONARQUBE_TOKEN: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    DATABASE_URL: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.SUPABASE_SECRET_KEY && !data.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "Set SUPABASE_SECRET_KEY (sb_secret_...) or legacy SUPABASE_SERVICE_ROLE_KEY",
        path: ["SUPABASE_SECRET_KEY"],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export let env!: AppEnv;

let initialized = false;

function parseEnv(): AppEnv {
  // Preserve the legacy PascalCase alias for the image-builder CodeBuild project
  // name so existing deployments keep working after centralizing this read.
  if (!process.env.IMAGE_BUILDER_CODEBUILD_PROJECT && process.env.ImageBuilderCodeBuildProject) {
    process.env.IMAGE_BUILDER_CODEBUILD_PROJECT = process.env.ImageBuilderCodeBuildProject;
  }

  const parsed = envSchema.parse(process.env);

  if (parsed.NODE_ENV === "production" && parsed.CORS_ORIGIN === "*") {
    throw new Error(
      "CORS_ORIGIN must be set to a specific origin (not \"*\") in production. " +
      "Example: CORS_ORIGIN=https://app.dockier.dev",
    );
  }

  return parsed;
}

/**
 * Load env files / remote secrets, then validate config.
 * Must complete before importing app modules (supabase client, crypto, etc.).
 */
export async function initConfig(): Promise<AppEnv> {
  if (initialized) return env;

  await bootstrapEnv();
  env = parseEnv();
  initialized = true;
  return env;
}
