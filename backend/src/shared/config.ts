import { z } from "zod";
import { bootstrapEnv } from "./env/load.js";
import { isSupabasePublishableKey, isSupabaseSecretKey } from "./supabase/keys.js";
import { logger } from "./logger.js";
import { SERVICE_NAMES } from "./constants/services.js";

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
      .enum(SERVICE_NAMES)
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
    /** Toggle the AI Dockerfile review layer. Review runs only when an OpenAI key is also set. */
    AI_DOCKERFILE_REVIEW: z.enum(["on", "off"]).default("on"),
    WEBHOOK_SECRET: z.string().optional(),
    INTERNAL_SERVICE_TOKEN: z.string().min(16).optional(),
    DEPLOY_CALLBACK_URL: z.string().optional(),
    IMAGE_BUILDER_CODEBUILD_PROJECT: z.string().min(1).default("image-builder"),
    PGBOSS_MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),
    SONARQUBE_URL: z.string().url().optional(),
    SONARQUBE_TOKEN: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    DATABASE_URL: z.string().min(1).optional(),
    ENV_ENCRYPTION_KEY: z.string().min(32).optional(),
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

/**
 * Application environment configuration.
 *
 * Backed by a Proxy that throws a clear error if any property is accessed
 * before `initConfig()` completes. This catches initialization-order bugs
 * at runtime with a descriptive message instead of silently returning undefined.
 *
 * After `initConfig()`, the proxy forwards all reads to the validated config object.
 */
let _env: AppEnv | null = null;

export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, prop) {
    if (_env === null) {
      throw new Error(
        `Config not initialized — cannot read env.${String(prop)} before initConfig() completes. ` +
        "Ensure initConfig() is awaited in server.ts before importing modules that read config at load time.",
      );
    }
    return _env[prop as keyof AppEnv];
  },
  set(_target, prop) {
    throw new Error(`env.${String(prop)} is read-only — configuration cannot be mutated after initialization.`);
  },
});

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

  // Warn about critical optional vars in production
  if (parsed.NODE_ENV === "production") {
    if (!parsed.DATABASE_URL) {
      throw new Error("DATABASE_URL is required in production (job queue will not function without it).");
    }
    if (!parsed.WEBHOOK_SECRET) {
      throw new Error("WEBHOOK_SECRET is required in production (webhook endpoints will reject all requests).");
    }
    if (!parsed.INTERNAL_SERVICE_TOKEN) {
      // Fall back to WEBHOOK_SECRET but warn — this preserves backward compat
      // while encouraging migration to a separate token.
      logger.warn(
        "[config] INTERNAL_SERVICE_TOKEN not set — falling back to WEBHOOK_SECRET. " +
        "Set a separate INTERNAL_SERVICE_TOKEN for defense-in-depth.",
      );
    }
  }

  // Warn when the deprecated legacy key is in use
  if (parsed.SUPABASE_SERVICE_ROLE_KEY && !parsed.SUPABASE_SECRET_KEY) {
    logger.warn(
      "[config] SUPABASE_SERVICE_ROLE_KEY is deprecated — migrate to SUPABASE_SECRET_KEY (sb_secret_...). " +
      "Support will be removed in a future release.",
    );
  }

  return parsed;
}

/**
 * Load env files / remote secrets, then validate config.
 * Must complete before importing app modules (supabase client, crypto, etc.).
 */
export async function initConfig(): Promise<AppEnv> {
  if (initialized) return _env!;

  await bootstrapEnv();
  _env = parseEnv();
  initialized = true;
  return _env;
}
