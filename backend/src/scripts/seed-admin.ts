import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { initConfig, env } from "../shared/config.js";
import { resolveSupabaseSecretKey } from "../shared/supabase/keys.js";
import { seedDefaultRoles } from "../services/roles/seed.js";

const seederEnvSchema = z.object({
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

type SeederEnv = z.infer<typeof seederEnvSchema>;

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
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const lowerEmail = email.toLowerCase();

  const { data: profileData } = await supabase.from("profiles").select("id,email").eq("email", lowerEmail).maybeSingle();
  if (profileData?.id) return profileData.id;

  const { data: appUserData } = await supabase.from("users").select("id,email").eq("email", lowerEmail).maybeSingle();
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
  supabase: SupabaseClient,
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
  await initConfig();

  const seederEnv = seederEnvSchema.parse({
    ...process.env,
    ADMIN_SEED_ORG_SLUG: process.env.ADMIN_SEED_ORG_SLUG
      ? normalizeSlug(process.env.ADMIN_SEED_ORG_SLUG)
      : normalizeSlug(process.env.ADMIN_SEED_ORG_NAME ?? "Dockier"),
  });

  const supabase = createClient(env.SUPABASE_URL, resolveSupabaseSecretKey(env), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { userId, wasCreated } = await resolveAuthUser(supabase, seederEnv);
  const email = seederEnv.ADMIN_SEED_EMAIL.toLowerCase();
  const displayName = seederEnv.ADMIN_SEED_DISPLAY_NAME;

  // 1. Upsert organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .upsert(
      { name: seederEnv.ADMIN_SEED_ORG_NAME, slug: seederEnv.ADMIN_SEED_ORG_SLUG, created_by: userId },
      { onConflict: "slug" },
    )
    .select("id, slug")
    .single();
  if (orgError || !org) throw orgError ?? new Error("Failed to create organization");

  // 2. Upsert membership (owner)
  const { error: membershipError } = await supabase
    .from("organization_memberships")
    .upsert(
      { organization_id: org.id, user_id: userId, is_owner: true, status: "active" },
      { onConflict: "organization_id,user_id" },
    );
  if (membershipError) throw membershipError;

  // 3. Upsert profile
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, email, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (profileError) throw profileError;

  // 4. Upsert user record
  const { error: userError } = await supabase
    .from("users")
    .upsert(
      { id: userId, email, name: displayName, organization_id: org.id, created_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (userError) throw userError;

  // 5. Seed default roles and assign admin role to membership
  const { adminRoleId } = await seedDefaultRoles(org.id);

  const { error: roleAssignError } = await supabase
    .from("organization_memberships")
    .update({ role_id: adminRoleId })
    .eq("organization_id", org.id)
    .eq("user_id", userId);
  if (roleAssignError) throw roleAssignError;

  console.log("Admin seeder completed.");
  console.log(`Auth user: ${userId} (${wasCreated ? "created" : "existing"})`);
  console.log(`Organization: ${org.slug} (${org.id})`);
  console.log("Membership role: admin");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
  console.error(`Admin seeder failed: ${message}`);
  process.exit(1);
});
