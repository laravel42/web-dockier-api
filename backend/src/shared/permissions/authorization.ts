/**
 * Authorization Middleware & Helpers
 *
 * Provides permission-based access control that resolves permissions
 * from the user's role at request time (not from JWT claims).
 */

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../supabase/client.js";
import { getAuth } from "../auth.js";
import type { PermissionKey } from "./constants.js";
import { CRITICAL_PERMISSIONS } from "./constants.js";
import { getHierarchyLevel } from "./role-templates.js";
import { MemoryCache } from "../memory-cache.js";

export interface ResolvedAuth {
  userId: string;
  email: string;
  tenantId: string;
  roleId: string;
  systemKey: string | null;
  permissions: PermissionKey[];
  isOwner: boolean;
  hierarchyLevel: number;
}

declare module "fastify" {
  interface FastifyRequest {
    resolvedAuth?: ResolvedAuth;
  }

  interface FastifyInstance {
    requirePermission: (...permissions: PermissionKey[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * In-memory cache for permission resolution.
 * Key: `${userId}:${tenantId}`, TTL: 30s so role changes propagate quickly.
 */
const permissionCache = new MemoryCache<ResolvedAuth>({ maxSize: 5_000, sweepIntervalMs: 60_000 });
const CACHE_TTL_MS = 30_000;

/**
 * In-flight resolution map (singleflight pattern).
 *
 * When multiple concurrent requests miss the cache for the same user+tenant,
 * they all await the same Promise instead of each firing independent DB queries.
 * This prevents thundering herd on cache expiry under burst traffic.
 *
 * Entries are removed as soon as the Promise settles (success or failure),
 * so subsequent requests after resolution will hit the warm cache.
 */
const inflight = new Map<string, Promise<ResolvedAuth | null>>();

export function invalidatePermissionCache(userId: string, tenantId: string): void {
  permissionCache.delete(`${userId}:${tenantId}`);
}

export function clearPermissionCache(): void {
  permissionCache.clear();
  inflight.clear();
}

export function destroyPermissionCache(): void {
  permissionCache.destroy();
  inflight.clear();
}

/**
 * Resolve the full auth context for a user in a tenant.
 *
 * Uses a three-tier resolution strategy:
 * 1. Return from cache if available (hot path, ~0ms)
 * 2. Join an in-flight resolution if one is already running for this key (singleflight)
 * 3. Start a new resolution with a 5s timeout and populate both the inflight map and cache
 *
 * The singleflight pattern prevents thundering herd: when the cache expires
 * and 50 concurrent requests arrive for the same user, only ONE DB round-trip
 * fires — all others await the same Promise.
 */
async function resolvePermissions(userId: string, tenantId: string, email: string): Promise<ResolvedAuth | null> {
  const cacheKey = `${userId}:${tenantId}`;

  // 1. Cache hit — fast path
  const cached = permissionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Singleflight — join existing in-flight resolution
  const existing = inflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  // 3. Start new resolution with a timeout that is properly cleaned up
  const RESOLVE_TIMEOUT_MS = 5_000;

  const promise = (async (): Promise<ResolvedAuth | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        resolvePermissionsFromDb(userId, tenantId, email),
        new Promise<null>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Permission resolution timed out")), RESOLVE_TIMEOUT_MS);
        }),
      ]);
      return result;
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  })();

  inflight.set(cacheKey, promise);

  try {
    const result = await promise;
    if (result) {
      permissionCache.set(cacheKey, result, CACHE_TTL_MS);
    }
    return result;
  } finally {
    inflight.delete(cacheKey);
  }
}

/**
 * Perform the actual DB queries for permission resolution.
 * Separated from resolvePermissions to keep the timeout wrapper clean.
 *
 * ─── Required Database Indexes ─────────────────────────────────────
 *
 * These queries run on EVERY authenticated request (before cache hit).
 * Without proper indexes, they degrade to sequential scans under load.
 *
 * organization_memberships (migration 0004):
 *   - idx_org_memberships_org_user ON (organization_id, user_id)
 *     Used by Query 1 — membership lookup by org + user.
 *
 * roles (migration 0008):
 *   - PRIMARY KEY on (id)
 *     Used by Query 2a — role lookup by ID.
 *   - idx_roles_org ON (organization_id)
 *     Supports the .eq("organization_id", tenantId) filter.
 *   - idx_roles_deleted ON (deleted_at) WHERE deleted_at IS NULL
 *     Supports the .is("deleted_at", null) filter without scanning soft-deleted rows.
 *
 * role_permissions (migration 0035):
 *   - idx_role_permissions_role ON (role_id)
 *     Used by Query 2b — permission lookup by role.
 *
 * If adding a new query to this function, document its index dependency here.
 * ───────────────────────────────────────────────────────────────────
 */
async function resolvePermissionsFromDb(userId: string, tenantId: string, email: string): Promise<ResolvedAuth | null> {
  // Query 1: Fetch membership (validates user belongs to tenant and is active)
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_memberships")
    .select("role_id, is_owner, status")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership) return null;

  const roleId = membership.role_id;
  if (!roleId) return null;

  // Query 2: Fetch role + permissions in parallel (2 queries → 1 round-trip)
  const [roleResult, permResult] = await Promise.all([
    supabaseAdmin
      .from("roles")
      .select("id, system_key")
      .eq("id", roleId)
      .eq("organization_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabaseAdmin
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleId),
  ]);

  if (roleResult.error || !roleResult.data) return null;
  if (permResult.error) return null;

  const role = roleResult.data;
  const permissions = (permResult.data ?? []).map((rp) => rp.permission_id as PermissionKey);

  return {
    userId,
    email,
    tenantId,
    roleId: role.id,
    systemKey: role.system_key ?? null,
    permissions,
    isOwner: membership.is_owner ?? false,
    hierarchyLevel: getHierarchyLevel(role.system_key ?? null),
  };
}

/**
 * Check if a user has ALL of the specified permissions.
 */
export function hasPermissions(resolved: ResolvedAuth, required: PermissionKey[]): boolean {
  return required.every((p) => resolved.permissions.includes(p));
}

/**
 * Check if a user can assign a set of permissions.
 * Users cannot assign critical permissions they don't possess.
 */
export function canAssignPermissions(actor: ResolvedAuth, permissionsToAssign: PermissionKey[]): boolean {
  for (const perm of permissionsToAssign) {
    if (CRITICAL_PERMISSIONS.includes(perm) && !actor.permissions.includes(perm)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if an actor can manage a target role based on hierarchy.
 * Users can assign/edit roles at their own level or below, but not above.
 */
export function canManageRole(actor: ResolvedAuth, targetSystemKey: string | null): boolean {
  const targetLevel = getHierarchyLevel(targetSystemKey);
  return actor.hierarchyLevel <= targetLevel;
}

export const authorizationPlugin = fp(async (app: FastifyInstance) => {
  /**
   * Middleware factory: requires the authenticated user to have ALL specified permissions.
   */
  app.decorate("requirePermission", (...permissions: PermissionKey[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // First ensure the user is authenticated
      await app.requireAuth(request, reply);
      if (reply.sent) return;

      const auth = getAuth(request);
      const resolved = await resolvePermissions(auth.userId, auth.tenantId, auth.email);

      if (!resolved) {
        return reply.forbidden("No active membership in this organization");
      }

      request.resolvedAuth = resolved;

      if (!hasPermissions(resolved, permissions)) {
        return reply.forbidden("Insufficient permissions");
      }
    };
  });

  /**
   * Middleware: requires the user to be the Owner of the organization.
   * Used for critical actions: organization.delete, ownership.transfer, billing.manage.
   */
  app.decorate("requireOwner", async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requireAuth(request, reply);
    if (reply.sent) return;

    const auth = getAuth(request);
    const resolved = await resolvePermissions(auth.userId, auth.tenantId, auth.email);

    if (!resolved) {
      return reply.forbidden("No active membership in this organization");
    }

    request.resolvedAuth = resolved;

    if (!resolved.isOwner) {
      return reply.forbidden("Organization owner access required");
    }
  });
});
