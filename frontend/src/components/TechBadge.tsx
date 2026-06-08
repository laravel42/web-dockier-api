import DevIcon from "./DevIcon";
import { chipCls } from "../utils/styles";

const ICON_MAP: Record<string, string> = {
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

const LABEL_MAP: Record<string, string> = {
  JavaScript: "JS", TypeScript: "TS", Python: "PY", "C++": "C++", "C#": "C#",
  Dockerfile: "Docker", Shell: "SH", Kotlin: "KT", Swift: "SW", Scala: "SC",
  HTML: "HTML", CSS: "CSS", SCSS: "SCSS", "Node.js": "Node",
};

interface Props {
  name: string;
  /** Pass a raw DevIcon slug to bypass the ICON_MAP lookup */
  icon?: string;
  /** Override the displayed label */
  label?: string;
  /** Custom icon size class (default "w-4 h-4") */
  iconSize?: string;
  /** Render only the icon without badge wrapper */
  iconOnly?: boolean;
}

export default function TechBadge({ name, icon, label, iconSize = "w-4 h-4", iconOnly }: Props) {
  const resolvedIcon = icon || ICON_MAP[name] || name.toLowerCase();

  if (iconOnly) {
    return <DevIcon src={resolvedIcon} className={iconSize} />;
  }

  return (
    <span className={`${chipCls} whitespace-nowrap`}>
      <DevIcon src={resolvedIcon} className={iconSize} />
      {label ?? LABEL_MAP[name] ?? name}
    </span>
  );
}
