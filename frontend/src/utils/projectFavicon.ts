function normalizeHttpUrl(raw: string): URL | undefined {
  try {
    const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(withScheme);
  } catch {
    return undefined;
  }
}

/** Acceptable aspect ratio for square avatar favicons — rejects wide wordmarks. */
export const AVATAR_FAVICON_ASPECT_MIN = 0.8;
export const AVATAR_FAVICON_ASPECT_MAX = 1.25;

export function isSuitableAvatarFaviconAspectRatio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= AVATAR_FAVICON_ASPECT_MIN && ratio <= AVATAR_FAVICON_ASPECT_MAX;
}

/** Reject empty/invalid favicon URLs before rendering or caching. */
export function isValidFaviconUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string" || !url.trim()) return false;

  const dataUrlMatch = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(url);
  if (dataUrlMatch) {
    const payload = dataUrlMatch[2] ?? "";
    if (!payload.trim()) return false;
    if (url.includes(";base64,") && payload.trim().length < 4) return false;
    return true;
  }

  try {
    const parsed = url.startsWith("http") ? new URL(url) : new URL(url, "https://placeholder.local");
    return Boolean(parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    return false;
  }
}

/**
 * The deployed site's own favicon, served from its own origin.
 *
 * Deliberately does NOT route through a third-party favicon service. Those
 * services answer 200 with a generic placeholder for domains they don't know,
 * which defeats the `onError` fallback chain and pins a wrong icon in place of
 * the real one resolved from the repository. They also disclose every customer's
 * deployed hostname — plus the viewer's IP and referrer — to a third party on
 * page load, which is not a reasonable default for a security product.
 */
export function getSiteFaviconUrl(siteUrl: string): string | undefined {
  const parsed = normalizeHttpUrl(siteUrl);
  if (!parsed?.hostname) return undefined;

  const candidate = `${parsed.origin}/favicon.ico`;
  return isValidFaviconUrl(candidate) ? candidate : undefined;
}
