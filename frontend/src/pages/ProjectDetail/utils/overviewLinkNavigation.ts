/** GitHub-style heading slug (matches common README anchor links). */
export function githubHeadingSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function findOverviewAnchorTarget(
  container: HTMLElement,
  hash: string,
): HTMLElement | null {
  const slug = decodeURIComponent(hash.replace(/^#/, ""));
  if (!slug) return null;

  const byId =
    document.getElementById(slug) ??
    container.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
  if (byId) return byId;

  const headings = container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  for (const heading of headings) {
    if (githubHeadingSlug(heading.textContent ?? "") === slug) {
      return heading;
    }
  }

  return null;
}

/** Intercept overview links: scroll to on-page anchors, block everything else. */
export function handleOverviewLinkClick(
  event: Pick<MouseEvent, "target" | "preventDefault" | "stopPropagation" | "button" | "metaKey" | "ctrlKey" | "shiftKey">,
  container: HTMLElement | null,
): void {
  if (!container) return;
  if (event.button !== 0) return;

  const anchor = (event.target as Element).closest("a");
  if (!anchor || !container.contains(anchor)) return;

  const href = anchor.getAttribute("href");
  if (!href) return;

  event.preventDefault();
  event.stopPropagation();

  const scrollToHash = (hash: string): boolean => {
    const target = findOverviewAnchorTarget(container, hash);
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  };

  if (href.startsWith("#")) {
    scrollToHash(href);
    return;
  }

  try {
    const url = new URL(href, window.location.href);
    if (url.hash) scrollToHash(url.hash);
  } catch {
    /* invalid URL */
  }
}
