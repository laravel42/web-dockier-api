/** Display order: error, warning, info. Alphabetical `severity` puts info before warning. */
export const SEVERITY_PAGE_ORDER = ["error", "warning", "info"] as const;
export type FindingSeverityLevel = (typeof SEVERITY_PAGE_ORDER)[number];

export function pageSlicesForSeverityOrder(
  offset: number,
  limit: number,
  bucketCounts: Record<FindingSeverityLevel, number>,
): Array<{ severity: FindingSeverityLevel; offset: number; limit: number }> {
  const slices: Array<{ severity: FindingSeverityLevel; offset: number; limit: number }> = [];
  let skip = offset;
  let remaining = limit;
  for (const severity of SEVERITY_PAGE_ORDER) {
    const size = bucketCounts[severity];
    if (size <= 0) continue;
    if (skip >= size) {
      skip -= size;
      continue;
    }
    const take = Math.min(remaining, size - skip);
    slices.push({ severity, offset: skip, limit: take });
    skip = 0;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return slices;
}
