import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { DomainError } from "../../../shared/supabase/errors.js";
import { seedDefaultRoles } from "../../roles/seed.js";
import { listMembershipsForUser, type Membership } from "./membership.js";
import { signTenantToken } from "./session.js";

export type RegistrationErrorCode = "unauthorized" | "forbidden" | "bad_request" | "internal";

export class RegistrationError extends DomainError {
  constructor(
    message: string,
    public readonly code: RegistrationErrorCode,
    cause?: unknown,
  ) {
    super(message, code, cause);
    this.name = "RegistrationError";
  }
}

/**
 * Classify Supabase auth errors into user-friendly messages.
 */
export function classifyAuthError(message: string): { status: "rate_limit" | "forbidden" | "bad_request"; userMessage: string } {
  if (/rate limit|over_email_send_rate_limit|security purposes/i.test(message)) {
    return { status: "rate_limit", userMessage: "Email rate limit exceeded. Please wait about 60 seconds before requesting another code." };
  }
  if (/signups?\s*(are)?\s*disabled|not allowed/i.test(message)) {
    return { status: "forbidden", userMessage: "Signups are disabled in Supabase Auth. Enable email signups to allow registration." };
  }
  return { status: "bad_request", userMessage: message };
}

/**
 * Find a Supabase auth user by email (paginated search).
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const lowerEmail = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new RegistrationError("Failed to search auth users", "internal", error);
    const matched = data.users.find((user) => (user.email ?? "").toLowerCase() === lowerEmail);
    if (matched?.id) return matched.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

/**
 * Resolve or create a demo auth user for development.
 */
export async function resolveDemoAuthUser(email: string): Promise<string> {
  const existing = await findAuthUserIdByEmail(email);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: `Demo-${Date.now()}-Aa1!`,
    email_confirm: true,
    user_metadata: { display_name: "Demo User", demo_user: true },
  });
  if (error || !data.user?.id) {
    throw new RegistrationError("Unable to create demo auth user", "internal", error);
  }
  return data.user.id;
}

export interface DemoLoginResult {
  session: { token: string; userId: string; tenantId: string };
  memberships: Membership[];
}

/**
 * Perform a full demo login: resolve user, upsert org, seed roles, return session.
 */
export async function performDemoLogin(): Promise<DemoLoginResult> {
  const demoTenantId = "00000000-0000-4000-8000-000000000010";
  const demoEmail = "demo@dockier.local";
  const demoName = "Demo User";
  const demoTenantName = "Demo Workspace";
  const demoTenantSlug = "demo-workspace";
  const now = new Date().toISOString();
  const demoUserId = await resolveDemoAuthUser(demoEmail);

  // Upsert user
  await supabaseAdmin.from("users").upsert(
    { id: demoUserId, email: demoEmail, name: demoName, organization_id: null, created_at: now },
    { onConflict: "id" },
  );

  // Upsert org
  await supabaseAdmin.from("organizations").upsert(
    { id: demoTenantId, name: demoTenantName, slug: demoTenantSlug, created_by: demoUserId },
    { onConflict: "id" },
  );

  // Sync user org
  await supabaseAdmin.from("users").update({ organization_id: demoTenantId, updated_at: now }).eq("id", demoUserId);

  // Seed roles
  const { adminRoleId } = await seedDefaultRoles(demoTenantId);

  // Upsert membership as owner
  await supabaseAdmin.from("organization_memberships").upsert(
    { organization_id: demoTenantId, user_id: demoUserId, role_id: adminRoleId, is_owner: true, status: "active" },
    { onConflict: "organization_id,user_id" },
  );

  return {
    session: {
      token: signTenantToken({ userId: demoUserId, email: demoEmail, tenantId: demoTenantId }),
      userId: demoUserId,
      tenantId: demoTenantId,
    },
    memberships: [
      { id: "00000000-0000-4000-8000-000000000099", tenantId: demoTenantId, tenantName: demoTenantName, tenantSlug: demoTenantSlug, roleName: "Admin", isOwner: true },
    ],
  };
}

export interface PasswordLoginParams {
  email: string;
  password: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export interface LoginResult {
  session: { token: string; userId: string; tenantId: string };
  memberships: Membership[];
}

/**
 * Perform password-based login (development only).
 * Creates a disposable Supabase client to avoid tainting the shared admin session.
 */
export async function performPasswordLogin(params: PasswordLoginParams): Promise<LoginResult> {
  const { createClient } = await import("@supabase/supabase-js");
  const authClient = createClient(params.supabaseUrl, params.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error || !data.user) throw new RegistrationError(error?.message ?? "Invalid email or password", "unauthorized");

  const userId = data.user.id;
  const email = data.user.email ?? params.email;

  // Ensure public.users record exists
  const { data: existingUser, error: userQueryError } = await supabaseAdmin.from("users").select("id").eq("id", userId).maybeSingle();
  if (userQueryError) throw new RegistrationError("Failed to look up user", "internal", userQueryError);
  if (!existingUser) {
    const displayName = data.user.user_metadata?.display_name || data.user.user_metadata?.name || email.split("@")[0];
    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: userId,
      email,
      name: displayName as string,
      organization_id: null,
      created_at: new Date().toISOString(),
    });
    if (insertError) throw new RegistrationError("Failed to create user record", "internal", insertError);
  }

  const memberships = await listMembershipsForUser(userId);
  const selected = memberships[0];
  if (!selected) throw new RegistrationError("No organization membership found. Contact your admin.", "forbidden");

  // Sync user's active org
  const { error: syncError } = await supabaseAdmin
    .from("users")
    .update({ organization_id: selected.tenantId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (syncError) throw new RegistrationError("Failed to sync active organization", "internal", syncError);

  return {
    session: {
      token: signTenantToken({ userId, email, tenantId: selected.tenantId }),
      userId,
      tenantId: selected.tenantId,
    },
    memberships,
  };
}

export interface VerifyOtpParams {
  email: string;
  token: string;
  type: "email" | "magiclink" | "signup";
  tenantSlug?: string;
  tenantName?: string;
}

/**
 * Verify OTP/magic link and provision user + tenant if needed.
 */
export async function verifyOtpAndProvision(params: VerifyOtpParams): Promise<LoginResult> {
  const { data, error } = await supabaseAdmin.auth.verifyOtp({
    email: params.email,
    token: params.token,
    type: params.type,
  });
  if (error || !data.user) throw new RegistrationError(error?.message ?? "Invalid OTP token", "unauthorized");

  const userId = data.user.id;
  const email = data.user.email ?? params.email;
  const displayName =
    (typeof data.user.user_metadata?.display_name === "string" && data.user.user_metadata.display_name) ||
    (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
    email.split("@")[0];
  const metadataTenantName =
    typeof data.user.user_metadata?.tenant_name === "string" ? data.user.user_metadata.tenant_name : undefined;

  // Upsert user record
  const { error: userError } = await supabaseAdmin.from("users").upsert(
    { id: userId, email, name: displayName, organization_id: null, created_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (userError) throw new RegistrationError("Failed to upsert user record", "internal", userError);

  let memberships = await listMembershipsForUser(userId);
  let selected: Membership | undefined = memberships[0];

  if (params.tenantSlug) {
    selected = memberships.find((m) => m.tenantSlug === params.tenantSlug);
    if (!selected) throw new RegistrationError("No membership in requested tenant", "forbidden");
  }

  // No existing membership — create a new org and make user Primary Owner
  if (!selected) {
    const tenantName = params.tenantName?.trim() || metadataTenantName || `${displayName}'s workspace`;
    const tenantSlugBase = slugifyTenant(tenantName) || "workspace";
    const tenantSlug = `${tenantSlugBase}-${userId.slice(0, 6)}`;

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: tenantName, slug: tenantSlug, created_by: userId })
      .select("id,name,slug")
      .single();
    if (orgError || !org) throw new RegistrationError("Failed to create tenant", "internal", orgError);

    const { adminRoleId } = await seedDefaultRoles(org.id);

    const { data: createdMembership, error: membershipError } = await supabaseAdmin
      .from("organization_memberships")
      .insert({
        organization_id: org.id,
        user_id: userId,
        role_id: adminRoleId,
        is_owner: true,
        status: "active",
      })
      .select("id,organization_id,is_owner")
      .single();
    if (membershipError || !createdMembership) {
      throw new RegistrationError("Failed to create membership", "internal", membershipError);
    }

    selected = {
      id: createdMembership.id,
      tenantId: org.id,
      tenantName: org.name,
      tenantSlug: org.slug,
      roleName: "Admin",
      isOwner: true,
    };
    memberships = [selected];
  }
  if (!selected) throw new RegistrationError("Unable to resolve tenant membership", "internal");

  // Sync user's active org
  const { error: syncError } = await supabaseAdmin
    .from("users")
    .update({ organization_id: selected.tenantId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (syncError) throw new RegistrationError("Failed to sync active organization", "internal", syncError);

  return {
    session: {
      token: signTenantToken({ userId, email, tenantId: selected.tenantId }),
      userId,
      tenantId: selected.tenantId,
    },
    memberships,
  };
}

/**
 * Slugify a tenant name for use as a URL slug.
 */
export function slugifyTenant(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
