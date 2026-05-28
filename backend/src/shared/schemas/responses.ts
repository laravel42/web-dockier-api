/**
 * Shared Response Schemas
 *
 * Common Zod schemas for API responses used across multiple services.
 * Reduces inline duplication and ensures consistent API shape.
 */

import { z } from "zod";

/** Standard success response for mutation endpoints (delete, toggle, etc.) */
export const successResponseSchema = z.object({ success: z.literal(true) });

/** Standard paginated list metadata */
export const paginationSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
