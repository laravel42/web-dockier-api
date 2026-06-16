const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  public:    { bg: "bg-emerald-500/30", text: "text-emerald-400", label: "Public" },
  internal:  { bg: "bg-blue-500/30",    text: "text-blue-400",    label: "Internal" },
  personal:  { bg: "bg-amber-500/30",   text: "text-amber-400",   label: "Personal" },
  sensitive: { bg: "bg-orange-500/30",  text: "text-orange-400",  label: "Sensitive" },
  secret:    { bg: "bg-red-500/30",     text: "text-red-400",     label: "Secret" },
};

interface Props {
  level: string;
  size?: "sm" | "xs";
}

export default function SensitivityBadge({ level, size = "xs" }: Props) {
  const s = STYLES[level] || STYLES.internal;
  const cls = size === "sm"
    ? `text-[11px] px-2 py-0.5`
    : `text-[10px] px-1.5 py-0.5`;
  return (
    <span className={`font-medium rounded-full shrink-0 ${cls} ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

/** Returns style info for use in custom layouts (e.g. count badges) */
export function getSensitivityStyle(level: string) {
  return STYLES[level] || STYLES.internal;
}
