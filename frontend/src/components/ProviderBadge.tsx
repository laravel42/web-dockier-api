import DevIcon from "./DevIcon";
import { getProviderStyle } from "../data/providers";
import { chipCls } from "../utils/styles";

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

  const label = ps.name || provider.toUpperCase();

  return (
    <span className={`${chipCls} whitespace-nowrap`}>
      {ps.icon && <DevIcon src={ps.icon} alt="" className={iconSize} />}
      {label}
      {suffix && <>{suffix}</>}
    </span>
  );
}
