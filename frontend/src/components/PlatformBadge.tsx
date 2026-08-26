import DevIcon from "./DevIcon";
import { chipCls } from "../utils/styles";

const PLATFORM_NAMES: Record<string, string> = {
  react: "React", nextjs: "Next.js", vue: "Vue", nuxt: "Nuxt", angular: "Angular", svelte: "Svelte",
  sveltekit: "SvelteKit", laravel: "Laravel", django: "Django", flask: "Flask", fastapi: "FastAPI",
  express: "Express", nestjs: "Nest.js", rails: "Rails", spring: "Spring", "spring-boot": "Spring Boot",
  go: "Go", rust: "Rust", python: "Python", php: "PHP", ruby: "Ruby", java: "Java", kotlin: "Kotlin",
  nodejs: "Node.js", astro: "Astro", remix: "Remix", gatsby: "Gatsby", solid: "Solid",
  "react-native": "React Native", flutter: "Flutter", dotnet: ".NET", symfony: "Symfony",
  hono: "Hono", fastify: "Fastify", bun: "Bun", deno: "Deno", elixir: "Elixir",
};

const PLATFORM_ICONS: Record<string, string> = {
  react: "react", nextjs: "nextdotjs", vue: "vuedotjs", nuxt: "nuxtdotjs", angular: "angular",
  svelte: "svelte", sveltekit: "svelte", laravel: "laravel", django: "django", flask: "flask",
  fastapi: "fastapi", express: "express", nestjs: "nestjs", rails: "rubyonrails", spring: "spring",
  "spring-boot": "springboot", go: "go", rust: "rust", python: "python", php: "php", ruby: "ruby",
  java: "openjdk", kotlin: "kotlin", nodejs: "nodedotjs", astro: "astro", remix: "remix",
  gatsby: "gatsby", solid: "solid", "react-native": "react", flutter: "flutter", dotnet: "dotnet",
  symfony: "symfony", hono: "hono", fastify: "fastify", bun: "bun", deno: "deno", elixir: "elixir",
};

interface Props {
  slug: string;
  /** Detected package version (e.g. from package.json / composer.json). */
  version?: string;
}

export default function PlatformBadge({ slug, version }: Props) {
  const label = PLATFORM_NAMES[slug] || slug;
  const icon = PLATFORM_ICONS[slug] || slug;
  const versionLabel = version?.trim();

  return (
    <span className={`${chipCls} whitespace-nowrap`}>
      <DevIcon src={icon} className="size-4 " />
      {label}
      {versionLabel ? (
        <>
          <span className="text-text-muted/50" aria-hidden>
            ·
          </span>
          <span className="tabular-nums text-text-muted">{versionLabel}</span>
        </>
      ) : null}
    </span>
  );
}
