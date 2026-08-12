/** Turn `barrier-repair-drops` into `Barrier repair drops` for breadcrumb tails. */
export function humanizePathSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export type BreadcrumbTailOverride =
  | string
  | ((segmentsAfterSection: readonly string[]) => string | undefined);

/** Path segments after the first occurrence of `sectionSegment` (e.g. `ecommerce` → `['product-detail-1']`). */
export function pathSegmentsAfter(
  pathname: string,
  sectionSegment: string,
): string[] | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf(sectionSegment);
  if (idx === -1) return undefined;
  const rest = parts.slice(idx + 1);
  return rest.length > 0 ? rest : undefined;
}

/**
 * Breadcrumb tail after `site.title` / `section`: humanize the last URL segment by default.
 * Overrides are keyed by the **first** segment after `sectionSegment` (e.g. `edit-product`).
 */
export function breadcrumbTailFromPath(
  pathname: string,
  sectionSegment: string,
  overrides?: Readonly<Record<string, BreadcrumbTailOverride>>,
): string | undefined {
  const segments = pathSegmentsAfter(pathname, sectionSegment);
  if (!segments?.length) return undefined;

  const first = segments[0]!;
  const override = overrides?.[first];
  if (override !== undefined) {
    return typeof override === "function" ? override(segments) : override;
  }

  const last = segments[segments.length - 1]!;
  return humanizePathSegment(last);
}
