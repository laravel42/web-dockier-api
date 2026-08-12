// Icons served statically from public/devicons/ — no Vite bundling needed.
import { DEVICON_FILES } from "./devicon-manifest";

// Icons that have -dark / -light variants
const THEMED_ICONS = new Set([
  "apple", "astro", "coder", "fastify", "flask", "github", "inngest",
  "nextjs", "nodejs", "nuxtjs", "openai", "prisma", "railway", "redhat",
  "rust", "spree", "timescale", "umami", "unreal", "vaultwarden",
]);

// Map external slugs → local filename (when they differ)
const SLUG_TO_LOCAL: Record<string, string> = {
  nodedotjs: "nodejs",
  vuedotjs: "vuejs",
  nuxt: "nuxtjs",
  nuxtdotjs: "nuxtjs",
  angular: "angularjs",
  rubyonrails: "rails",
  springboot: "spring",
  nextdotjs: "nextjs",
  emberdotjs: "ember",
  openjdk: "java",
  solid: "solidjs",
  "i/aws.svg": "aws",
  "vbnet": "vscode",
  "ipython": "python",
  "cloudformation": "aws",
  "sql": "sql",
  "sveltekit": "svelte"
};

function iconUrl(name: string): string {
  return `/devicons/${name}.svg`;
}

/**
 * Resolve a devicons slug to a static URL in public/devicons/.
 * When theme is known and a themed variant exists, returns that variant.
 */
export function resolveIcon(slug: string, dark?: boolean): string {
  const base = SLUG_TO_LOCAL[slug] ?? slug;
  const stripped = base.replace(/-(dark|light)$/, "");

  // If theme is known and a themed variant exists, use it
  if (dark !== undefined && THEMED_ICONS.has(stripped)) {
    const suffix = dark ? "-light" : "-dark";
    return iconUrl(stripped + suffix);
  }

  return iconUrl(base);
}

export function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * Whether a devicon actually exists for this slug.
 *
 * `resolveIcon` always returns a URL, so a slug with no file yields a broken
 * image the browser hides — leaving a badge with an empty gap where the icon
 * should be. Callers that would rather drop the badge entirely check here first.
 *
 * A slug counts as available when the plain file or either themed variant exists.
 */
export function hasDevIcon(slug: string): boolean {
  if (!slug.trim()) return false;

  const base = (SLUG_TO_LOCAL[slug] ?? slug).replace(/-(dark|light)$/, "");
  return (
    DEVICON_FILES.has(base) ||
    DEVICON_FILES.has(`${base}-dark`) ||
    DEVICON_FILES.has(`${base}-light`)
  );
}
