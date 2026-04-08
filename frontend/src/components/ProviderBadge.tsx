import DevIcon from "./DevIcon";
import { getProviderStyle } from "../data/providers";

interface Props {
  provider: string;
  /** Extra text appended after the provider name, e.g. "· ECS Fargate" */
  suffix?: string;
  iconSize?: string;
  showName?: boolean;
}

export default function ProviderBadge({ provider, suffix, iconSize = "w-2.5 h-2.5", showName = true }: Props) {
  const ps = getProviderStyle(provider);

  if (!showName) {
    return ps.icon ? <DevIcon src={ps.icon} alt="" className={iconSize} /> : null;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${ps.bg} ${ps.text}`}>
      {ps.icon && <DevIcon src={ps.icon} alt="" className={iconSize} />}
      {provider.toUpperCase()}
      {suffix && <>{suffix}</>}
    </span>
  );
}
