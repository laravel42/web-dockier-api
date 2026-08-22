import { chipCls } from "../utils/styles";
import { getDeployServiceLabel } from "../utils/deployService";

interface Props {
  provider: string;
  strategy: string;
  size?: "default" | "compact";
}

export default function ServiceBadge({ provider, strategy, size = "default" }: Props) {
  const label = getDeployServiceLabel(provider, strategy);
  if (!label) return null;

  return (
    <span
      className={
        size === "compact"
          ? "inline-flex shrink-0 items-center rounded border border-border/60 bg-card/40 px-1 py-px text-xs/tight text-text-muted"
          : chipCls
      }
    >
      {label}
    </span>
  );
}
