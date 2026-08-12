import { hasDevIcon } from "../data/devicons";

/** Language / framework names whose devicon slug differs from the lowercased name. */
export const TECH_ICON_MAP: Record<string, string> = {
  JavaScript: "javascript", TypeScript: "typescript", Python: "python", PHP: "php",
  Java: "java", Go: "go", Ruby: "ruby", Rust: "rust", "C#": "csharp", "C++": "cplusplus",
  C: "c", Kotlin: "kotlin", Swift: "swift", Scala: "scala", Shell: "bash", Dart: "dart",
  HTML: "html5", CSS: "css3", Vue: "vuejs", SCSS: "sass", Sass: "sass",
  Dockerfile: "docker", Elixir: "elixir", Lua: "lua", Perl: "perl", R: "r",
  "Node.js": "nodejs", React: "react", Angular: "angularjs", Laravel: "laravel",
  Django: "django", Rails: "rails", "Next.js": "nextjs", Express: "express",
  Flask: "flask", Spring: "spring", ".NET": "dot-net",
  "Tailwind CSS": "tailwind_css", Tailwind: "tailwind_css",
};

/** The devicon slug a tech badge will render, mirroring TechBadge's own lookup. */
export function resolveTechBadgeIcon(name: string, icon?: string): string {
  return icon || TECH_ICON_MAP[name] || name.toLowerCase();
}

/**
 * Whether this stack entry has an icon to show.
 *
 * Stack badges are a visual index, so an entry with no icon carries almost no
 * information beyond its name — and worse, it consumes one of the few slots the
 * list has room for. Filtering on this keeps those slots for stacks that read.
 */
export function techBadgeHasIcon(name: string, icon?: string): boolean {
  return hasDevIcon(resolveTechBadgeIcon(name, icon));
}
