/**
 * Standard paginated list metadata returned by all list endpoints.
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}
