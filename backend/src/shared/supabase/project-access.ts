/**
 * Shared Project Ownership Validation
 *
 * Verifies that a project belongs to the authenticated tenant.
 * Used by multiple services (commands, observe, processes, network, domains)
 * before performing project-scoped operations.
 */

import { supabaseAdmin } from "./client.js";
import { DomainError } from "./errors.js";

/**
 * Assert that a project exists and belongs to the given tenant.
 *
 * Throws a DomainError with code "not_found" if the project doesn't exist
 * or doesn't belong to the tenant. This is caught by the global error handler
 * and mapped to a 404 response.
 *
 * @example
 * ```ts
 * await assertProjectAccess(projectId, tenantId);
 * // project is guaranteed to belong to tenantId at this point
 * ```
 */
export async function assertProjectAccess(projectId: string, tenantId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (error || !data) {
    throw new DomainError("Project not found", "not_found", error);
  }
}
