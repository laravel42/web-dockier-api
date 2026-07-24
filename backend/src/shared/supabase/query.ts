/**
 * Supabase Query Helpers
 *
 * Standardized utilities for handling Supabase query results.
 * Eliminates repetitive if (error) / if (!data) boilerplate
 * and ensures consistent error wrapping across all domain functions.
 */


/**
 * Supabase PostgREST error shape.
 */
export interface PostgrestError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Options for query error handling.
 */
export interface QueryErrorOptions {
  /** Message for "not found" errors (PGRST116 or null data). Defaults to "Resource not found". */
  notFoundMsg?: string;
  /** Message for generic internal errors. Defaults to "Database query failed". */
  internalMsg?: string;
  /** Message for unique constraint violations (23505). If provided, throws bad_request instead of internal. */
  duplicateMsg?: string;
}

/**
 * DomainError constructor type — matches all service error classes.
 * Uses `string` for the code parameter to accommodate service-specific
 * error code unions that are subsets of BaseDomainErrorCode.
 */

import type { ErrorMetadata } from "./errors.js";
 
export type DomainErrorConstructor<E extends Error = Error> = new (
  message: string,
  code: string,
  cause?: unknown,
  metadata?: ErrorMetadata,
) => E;

/**
 * Throw a domain error if a Supabase query returned an error.
 *
 * Handles common PostgREST error codes:
 * - PGRST116: row not found (.single() with no match) → not_found
 * - 23505: unique constraint violation → bad_request (if duplicateMsg provided)
 * - Everything else → internal
 *
 * @example
 * ```ts
 * const { data, error } = await supabaseAdmin.from("projects").select("*").eq("id", id).single();
 * throwOnError(error, ProjectsError, { notFoundMsg: "Project not found" });
 * ```
 */
export function throwOnError<E extends Error>(
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E>,
  opts: QueryErrorOptions = {},
): void {
  if (!error) return;

  const { notFoundMsg = "Resource not found", internalMsg = "Database query failed", duplicateMsg } = opts;

  if (error.code === "PGRST116") {
    throw new ErrorClass(notFoundMsg, "not_found", error);
  }
  if (error.code === "23505" && duplicateMsg) {
    throw new ErrorClass(duplicateMsg, "bad_request", error);
  }
  throw new ErrorClass(internalMsg, "internal", error);
}

/**
 * Assert that data is not null/undefined after a Supabase query.
 * Use after throwOnError() for .single() / .maybeSingle() queries
 * where data could still be null even without an error.
 *
 * @example
 * ```ts
 * const { data, error } = await supabaseAdmin.from("projects").select("*").eq("id", id).single();
 * throwOnError(error, ProjectsError, { notFoundMsg: "Project not found" });
 * const project = assertFound(data, ProjectsError, "Project not found");
 * ```
 */
export function assertFound<T, E extends Error>(
  data: T | null | undefined,
  ErrorClass: DomainErrorConstructor<E>,
  notFoundMsg = "Resource not found",
): T {
  if (data === null || data === undefined) {
    throw new ErrorClass(notFoundMsg, "not_found");
  }
  return data;
}

/**
 * Combined helper: check error, then assert data exists.
 * Ideal for .single() queries where you expect exactly one row.
 *
 * @example
 * ```ts
 * const { data, error } = await supabaseAdmin.from("projects").select("*").eq("id", id).single();
 * const project = unwrapQuery(data, error, ProjectsError, {
 *   notFoundMsg: "Project not found",
 *   internalMsg: "Failed to fetch project",
 * });
 * ```
 */
export function unwrapQuery<T, E extends Error>(
  data: T | null | undefined,
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E>,
  opts: QueryErrorOptions = {},
): T {
  throwOnError(error, ErrorClass, opts);
  return assertFound(data, ErrorClass, opts.notFoundMsg);
}

/**
 * Helper for list queries: check error, return data or empty array.
 * Ideal for .select() queries that return arrays.
 *
 * @example
 * ```ts
 * const { data, error } = await supabaseAdmin.from("projects").select("*").eq("organization_id", tenantId);
 * const rows = unwrapList(data, error, ProjectsError, { internalMsg: "Failed to list projects" });
 * ```
 */
export function unwrapList<T, E extends Error>(
  data: T[] | null,
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E>,
  opts: QueryErrorOptions = {},
): T[] {
  throwOnError(error, ErrorClass, opts);
  return data ?? [];
}

/**
 * Helper for mutation queries (insert/update/delete) that only return an error.
 * Throws a domain error if the mutation failed.
 *
 * @example
 * ```ts
 * const { error } = await supabaseAdmin.from("projects").insert(payload);
 * throwOnMutationError(error, ProjectsError, {
 *   internalMsg: "Failed to create project",
 *   duplicateMsg: "A project with this name already exists",
 * });
 * ```
 */
export function throwOnMutationError<E extends Error>(
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E>,
  opts: QueryErrorOptions = {},
): void {
  throwOnError(error, ErrorClass, opts);
}

// ─── Tenant Ownership Validation ───────────────────────────────────

/**
 * Assert that a database row belongs to the authenticated tenant.
 *
 * Compares `row.organization_id` against `tenantId` and throws a
 * "forbidden" domain error if they don't match. Returns the row
 * unchanged for convenient chaining.
 *
 * @example
 * ```ts
 * const build = unwrapQuery(data, error, ImageBuilderError, { notFoundMsg: "Build not found" });
 * assertOwnership(build, tenantId, ImageBuilderError, "Not your build");
 * ```
 */
export function assertOwnership<T extends { organization_id: string }, E extends Error>(
  row: T,
  tenantId: string,
  ErrorClass: DomainErrorConstructor<E>,
  message = "Access denied",
): T {
  if (row.organization_id !== tenantId) {
    throw new ErrorClass(message, "forbidden");
  }
  return row;
}

// ─── Pagination Helpers ────────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Normalize raw pagination params into safe, bounded values.
 *
 * Applies:
 * - Default limit: 20, max limit: 100
 * - Default offset: 0, min offset: 0
 *
 * Use this in domain functions that receive raw query params.
 *
 * @example
 * ```ts
 * const { limit, offset } = normalizePagination(params);
 * const query = supabaseAdmin.from("projects").select("*").range(offset, offset + limit - 1);
 * ```
 */
export function normalizePagination(params: PaginationParams): { limit: number; offset: number } {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  return { limit, offset };
}

// ─── Paginated Query Helper ────────────────────────────────────────

/**
 * Options for the paginatedQuery helper.
 */
export interface PaginatedQueryOptions<TRow, TResult> {
  /** Error message when the query fails. */
  internalMsg?: string;
  /** Map a raw DB row to the API response shape. */
  map: (row: TRow) => TResult;
}

/**
 * Result shape returned by paginatedQuery.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

/**
 * Execute a paginated Supabase query and return mapped results with total count.
 *
 * Encapsulates the common pattern of:
 * 1. Apply `.range()` to a query that already has `{ count: "exact" }`
 * 2. `unwrapList()` the result
 * 3. Map rows to the response shape
 * 4. Return `{ data, total }`
 *
 * The caller is responsible for building the base query (table, filters, order)
 * and passing in validated `limit`/`offset` values.
 *
 * @example
 * ```ts
 * const query = supabaseAdmin
 *   .from("deployments")
 *   .select("*", { count: "exact" })
 *   .eq("organization_id", tenantId)
 *   .order("created_at", { ascending: false });
 *
 * return paginatedQuery(query, { limit, offset }, DeployError, {
 *   internalMsg: "Failed to list deployments",
 *   map: rowToDeployment,
 * });
 * ```
 */
export async function paginatedQuery<TRow, TResult, E extends Error>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: TRow[] | null; error: PostgrestError | null; count: number | null }> },
  pagination: { limit: number; offset: number },
  ErrorClass: DomainErrorConstructor<E>,
  options: PaginatedQueryOptions<TRow, TResult>,
): Promise<PaginatedResult<TResult>> {
  const { limit, offset } = pagination;
  const { internalMsg = "Database query failed", map } = options;

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  const rows = unwrapList(data, error, ErrorClass, { internalMsg });

  return {
    data: rows.map(map),
    total: count ?? rows.length,
  };
}
