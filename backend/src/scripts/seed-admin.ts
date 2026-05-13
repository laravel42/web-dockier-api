import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(thisFile);
const backendDir = resolve(scriptsDir, "../..");
const workspaceDir = resolve(backendDir, "..");

loadEnv({ path: resolve(workspaceDir, ".env.local"), override: false });
loadEnv({ path: resolve(workspaceDir, ".env"), override: false });
loadEnv({ path: resolve(backendDir, ".env.local"), override: false });
loadEnv({ path: resolve(backendDir, ".env"), override: false });

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ADMIN_SEED_EMAIL: z.email().default("admin@example.com"),
  ADMIN_SEED_PASSWORD: z.string().min(8).optional(),
  ADMIN_SEED_DISPLAY_NAME: z.string().min(1).default("Dockier Admin"),
  ADMIN_SEED_ORG_NAME: z.string().min(2).default("Dockier"),
  ADMIN_SEED_ORG_SLUG: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "ADMIN_SEED_ORG_SLUG must be lowercase letters, numbers, and hyphens"),
});

type SeederEnv = z.infer<typeof envSchema>;

function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return slug.length >= 2 ? slug : "dockier-admin";
}

async function findAuthUserIdByEmail(
  supabase: any,
  email: string,
): Promise<string | null> {
  const lowerEmail = email.toLowerCase();

  const { data: profileData } = await supabase.from("profiles").select("id,email").eq("email", email).maybeSingle();
  if (profileData?.id) return profileData.id;

  const { data: appUserData } = await supabase.from("users").select("id,email").eq("email", email).maybeSingle();
  if (appUserData?.id) return appUserData.id;

  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const matched = data.users.find(
      (user: { email?: string | null; id?: string }) => (user.email ?? "").toLowerCase() === lowerEmail,
    );
    if (matched?.id) return matched.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function resolveAuthUser(
  supabase: any,
  env: SeederEnv,
): Promise<{ userId: string; wasCreated: boolean }> {
  const email = env.ADMIN_SEED_EMAIL.toLowerCase();
  const existingUserId = await findAuthUserIdByEmail(supabase, email);
  if (existingUserId) return { userId: existingUserId, wasCreated: false };

  const generatedPassword = `Seeded-${randomUUID()}-Aa1!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: env.ADMIN_SEED_PASSWORD ?? generatedPassword,
    email_confirm: true,
    user_metadata: {
      display_name: env.ADMIN_SEED_DISPLAY_NAME,
      seeded_admin: true,
    },
  });

  if (error) {
    const fallbackUserId = await findAuthUserIdByEmail(supabase, email);
    if (fallbackUserId) return { userId: fallbackUserId, wasCreated: false };
    throw error;
  }

  if (!data.user?.id) {
    throw new Error("Supabase did not return a user ID after createUser");
  }

  return { userId: data.user.id, wasCreated: true };
}

async function main() {
  const env = envSchema.parse({
    ...process.env,
    ADMIN_SEED_ORG_SLUG: process.env.ADMIN_SEED_ORG_SLUG
      ? normalizeSlug(process.env.ADMIN_SEED_ORG_SLUG)
      : normalizeSlug(process.env.ADMIN_SEED_ORG_NAME ?? "Dockier"),
  });

  const supabase = createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { userId, wasCreated } = await resolveAuthUser(supabase, env);
  const { data: seededState, error: seedError } = await supabase.rpc("seed_admin_state", {
    _user_id: userId,
    _email: env.ADMIN_SEED_EMAIL.toLowerCase(),
    _display_name: env.ADMIN_SEED_DISPLAY_NAME,
    _organization_name: env.ADMIN_SEED_ORG_NAME,
    _organization_slug: env.ADMIN_SEED_ORG_SLUG,
  });
  if (seedError) throw seedError;

  const firstSeedRow =
    Array.isArray(seededState) && seededState.length > 0
      ? (seededState[0] as { organization_id: string; organization_slug: string })
      : null;
  if (!firstSeedRow?.organization_id || !firstSeedRow.organization_slug) {
    throw new Error("seed_admin_state did not return organization details");
  }

  console.log("Admin seeder completed.");
  console.log(`Auth user: ${userId} (${wasCreated ? "created" : "existing"})`);
  console.log(`Organization: ${firstSeedRow.organization_slug} (${firstSeedRow.organization_id})`);
  console.log("Membership role: admin");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Admin seeder failed: ${message}`);
  process.exit(1);
});
