import DevIcon from "./DevIcon";
import { chipCls } from "../utils/styles";
import { platformLabel } from "../utils/platformLabel";

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
  const label = platformLabel(slug);
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
