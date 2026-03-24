// Eagerly import all local icon assets via Vite glob import.
// Keys are like "../assets/icons/react.svg" → we extract the filename stem.
const modules = import.meta.glob("../assets/icons/*.{svg,png}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

// Build a lookup: "react" → "/assets/icons/react-abc123.svg" (resolved URL)
const localIcons: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  // "../assets/icons/react.svg" → "react"
  const name = path.split("/").pop()!.replace(/\.(svg|png)$/, "");
  localIcons[name] = url;
}

// Map devicons CDN slug → local filename (when they differ)
const SLUG_TO_LOCAL: Record<string, string> = {
  github: "github",
  dotnet: "dot-net",
  nodedotjs: "nodejs",
  vuedotjs: "vuejs",
  nuxtdotjs: "nuxtjs",
  angularjs: "angularjs",
  angular: "angularjs",
  rubyonrails: "rails",
  springboot: "spring",
  nextdotjs: "nextjs",
  emberdotjs: "ember",
  astro: "astro",
  flask: "flask",
  fastify: "fastify",
  rust: "rust",
  apple: "apple",
  cplusplus: "cplusplus",
  openjdk: "java",
  solid: "solidjs",
  "i/aws.svg": "aws",
};

const CDN = "https://devicons.railway.com";

/**
 * Resolve a devicons slug to a URL.
 * Prefers local bundled file, falls back to CDN.
 * When `dark` is provided, tries the themed variant first:
 *   dark=true  → tries "{base}-dark" then "{base}"
 *   dark=false → tries "{base}-light" then "{base}"
 */
export function resolveIcon(slug: string, dark?: boolean): string {
  const base = SLUG_TO_LOCAL[slug] ?? slug;

  if (dark !== undefined) {
    const suffix = dark ? "-light" : "-dark";
    // Strip any existing -dark/-light suffix from base before adding the new one
    const stripped = base.replace(/-(dark|light)$/, "");
    const themed = stripped + suffix;
    if (localIcons[themed]) return localIcons[themed];
  }

  // Direct local match
  if (localIcons[base]) return localIcons[base];
  // Fallback to CDN
  return `${CDN}/${slug}`;
}

export function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export { localIcons };
