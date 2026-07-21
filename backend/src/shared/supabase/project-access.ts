/**
 * Shared Project Ownership Validation
 *
 * Verifies that a project belongs to the authenticated tenant.
 * Used by multiple services (commands, observe, processes, network, domains)
 * before performing project-scoped operations.
 */

import { supabaseAdmin } from "./client.js";
import { DomainError } from "./errors.js";
import { unwrapQuery, type DomainErrorConstructor } from "./query.js";

/**
 * Assert that a project exists and belongs to the given tenant.
 *
 * Throws a DomainError with code "not_found" if the project doesn't exist
 * or doesn't belong to the tenant, and "internal" if a database error occurs.
 * This is caught by the global error handler and mapped to the appropriate
 * HTTP response.
 *
 * @param projectId - The project ID to validate
 * @param tenantId - The tenant (organization) ID to check ownership against
 * @param ErrorClass - Optional domain-specific error class (defaults to DomainError)
 *
 * @example
 * ```ts
 * await assertProjectAccess(projectId, tenantId);
 * // or with a service-specific error class:
 * await assertProjectAccess(projectId, tenantId, CommandsError);
 * ```
 */
export async function assertProjectAccess(
  projectId: string,
  tenantId: string,
  ErrorClass?: DomainErrorConstructor,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();

  unwrapQuery(data, error, ErrorClass ?? (DomainError as unknown as DomainErrorConstructor), {
    notFoundMsg: "Project not found",
  });
}
