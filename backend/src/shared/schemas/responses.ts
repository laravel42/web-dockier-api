/**
 * Shared Response Schemas
 *
 * Common Zod schemas for API responses used across multiple services.
 * Reduces inline duplication and ensures consistent API shape.
 */

import { z } from "zod";

/** Standard success response for mutation endpoints (delete, toggle, etc.) */
export const successResponseSchema = z.object({ success: z.literal(true) });

// ─── Pagination ────────────────────────────────────────────────────

/**
 * Standard pagination query parameters (limit/offset).
 *
 * All list endpoints should use this schema for consistency.
 * Defaults: limit=20, offset=0. Max limit: 100.
 *
 * @example
 * ```ts
 * querystring: paginationQuerySchema.extend({ search: z.string().optional() }),
 * ```
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Type helper for pagination query params */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Standard paginated list metadata in responses */
export const paginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

/** Type helper for pagination response metadata */
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
