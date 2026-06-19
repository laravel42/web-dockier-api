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
 * Uses a loose type for the code parameter to accommodate
 * service-specific error code unions that are subsets of BaseDomainErrorCode.
 */
 
type DomainErrorConstructor<E extends Error, C extends string = string> = new (
  message: string,
  code: C,
  cause?: unknown,
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
export function throwOnError<E extends Error, C extends string>(
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E, C>,
  opts: QueryErrorOptions = {},
): void {
  if (!error) return;

  const { notFoundMsg = "Resource not found", internalMsg = "Database query failed", duplicateMsg } = opts;

  if (error.code === "PGRST116") {
    throw new ErrorClass(notFoundMsg, "not_found" as C, error);
  }
  if (error.code === "23505" && duplicateMsg) {
    throw new ErrorClass(duplicateMsg, "bad_request" as C, error);
  }
  throw new ErrorClass(internalMsg, "internal" as C, error);
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
export function assertFound<T, E extends Error, C extends string>(
  data: T | null | undefined,
  ErrorClass: DomainErrorConstructor<E, C>,
  notFoundMsg = "Resource not found",
): T {
  if (data === null || data === undefined) {
    throw new ErrorClass(notFoundMsg, "not_found" as C);
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
export function unwrapQuery<T, E extends Error, C extends string>(
  data: T | null | undefined,
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E, C>,
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
export function unwrapList<T, E extends Error, C extends string>(
  data: T[] | null,
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E, C>,
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
export function throwOnMutationError<E extends Error, C extends string>(
  error: PostgrestError | null,
  ErrorClass: DomainErrorConstructor<E, C>,
  opts: QueryErrorOptions = {},
): void {
  throwOnError(error, ErrorClass, opts);
}
