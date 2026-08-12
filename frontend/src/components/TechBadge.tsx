import DevIcon from "./DevIcon";
import { chipCls } from "../utils/styles";
import { resolveTechBadgeIcon } from "../utils/techBadgeIcon";

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
  const resolvedIcon = resolveTechBadgeIcon(name, icon);

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
