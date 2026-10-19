/**
 * Canonical display names for platform / framework / runtime identifiers.
 *
 * Single source of truth for the human label of a tech id. Lives here rather
 * than inside PlatformBadge because analyzer-produced free text (AI analysis,
 * deploy logs) has to resolve against the same table the badges use.
 */
export const PLATFORM_NAMES: Record<string, string> = {
  react: "React", nextjs: "Next.js", vue: "Vue", nuxt: "Nuxt", angular: "Angular", svelte: "Svelte",
  sveltekit: "SvelteKit", laravel: "Laravel", django: "Django", flask: "Flask", fastapi: "FastAPI",
  express: "Express", nestjs: "Nest.js", rails: "Rails", spring: "Spring", "spring-boot": "Spring Boot",
  go: "Go", rust: "Rust", python: "Python", php: "PHP", ruby: "Ruby", java: "Java", kotlin: "Kotlin",
  nodejs: "Node.js", astro: "Astro", remix: "Remix", gatsby: "Gatsby", solid: "Solid",
  "react-native": "React Native", flutter: "Flutter", dotnet: ".NET", symfony: "Symfony",
  hono: "Hono", fastify: "Fastify", bun: "Bun", deno: "Deno", elixir: "Elixir",
};

/** Lookup index keyed on the id with every separator removed. */
const NORMALIZED_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORM_NAMES).map(([id, name]) => [normalizeKey(id), name]),
);

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Canonical display name for a detected platform / framework / runtime.
 *
 * The input may be an internal id (`nuxtjs`) or analyzer free text
 * (`Nuxtjs`, `nuxt.js`, `NuxtJS`), so the lookup is matched on alphanumerics
 * only, with a trailing `js` stripped as a second attempt — that is what turns
 * every spelling of Nuxt into "Nuxt" while leaving `nextjs` → "Next.js" alone,
 * since it matches on the first attempt.
 *
 * An unrecognized value is returned unchanged: a wrong label is worse than the
 * analyzer's own wording, and blanking it would lose information.
 */
export function platformLabel(value: string): string {
  const key = normalizeKey(value);
  if (!key) return value;
  return NORMALIZED_NAMES[key] ?? NORMALIZED_NAMES[key.replace(/js$/, "")] ?? value;
}
