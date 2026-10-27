import { settingsBadgeCls, toneDotCls, type StatusTone } from "@/utils/styles";

interface Props {
  tone: StatusTone;
  label: string;
  /** Pulse the dot for in-progress states. */
  pulse?: boolean;
}

/**
 * Status dot plus label.
 *
 * Four surfaces repeated the same layout string with their own partial colour
 * tables. The colours come from `settingsBadgeCls` — the bordered, dark-mode
 * safe family that already covers every tone these statuses need.
 */
export default function StatusPill({ tone, label, pulse = false }: Props) {
  return (
    <span className={`gap-1.5 ${settingsBadgeCls[tone]}`}>
      <span className={`size-2 rounded-full ${pulse ? "animate-pulse" : ""} ${toneDotCls[tone]}`} />
      {label}
    </span>
  );
}
