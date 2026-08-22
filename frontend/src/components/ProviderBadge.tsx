import DevIcon from "./DevIcon";
import { getProviderStyle } from "../data/providers";
import { chipCls } from "../utils/styles";

interface Props {
  provider: string;
  /** Extra text appended after the provider name, e.g. "· ECS Fargate" */
  suffix?: string;
  iconSize?: string;
  showName?: boolean;
  size?: "default" | "compact";
}

export default function ProviderBadge({
  provider,
  suffix,
  iconSize,
  showName = true,
  size = "default",
}: Props) {
  const ps = getProviderStyle(provider);
  const compact = size === "compact";
  const glyph = iconSize ?? (compact ? "size-2.5" : "w-2.5 h-2.5");

  if (!showName) {
    return ps.icon ? <DevIcon src={ps.icon} alt="" className={glyph} /> : null;
  }

  const label = ps.name || provider.toUpperCase();

  return (
    <span
      className={
        compact
          ? "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-border/60 bg-card/40 px-1 py-px text-xs/tight text-text-muted"
          : `${chipCls} whitespace-nowrap`
      }
    >
      {ps.icon && <DevIcon src={ps.icon} alt="" className={glyph} />}
      {label}
      {suffix && <>{suffix}</>}
    </span>
  );
}
