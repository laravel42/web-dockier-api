import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: "../.env.local" });
loadEnv();

const envSchema = z.object({
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
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default("*"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  WEBHOOK_SECRET: z.string().optional(),
  SONARQUBE_URL: z.string().url().optional(),
  SONARQUBE_TOKEN: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

const parsed = envSchema.parse(process.env);

// Enforce CORS_ORIGIN in production — wildcard is not acceptable
if (parsed.NODE_ENV === "production" && parsed.CORS_ORIGIN === "*") {
  throw new Error(
    "CORS_ORIGIN must be set to a specific origin (not \"*\") in production. " +
    "Example: CORS_ORIGIN=https://app.dockier.dev"
  );
}

export const env: AppEnv = parsed;
