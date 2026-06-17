import { chipCls } from "../utils/styles";
import { getDeployServiceLabel } from "../utils/deployService";

interface Props {
  provider: string;
  strategy: string;
}

export default function ServiceBadge({ provider, strategy }: Props) {
  const label = getDeployServiceLabel(provider, strategy);
  if (!label) return null;

  return <span className={chipCls}>{label}</span>;
}
