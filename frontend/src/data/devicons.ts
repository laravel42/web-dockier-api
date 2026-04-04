// Icons served statically from public/devicons/ — no Vite bundling needed.

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
