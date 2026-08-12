const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  public:    { bg: "bg-success-surface", text: "text-success-ink", label: "Public" },
  internal:  { bg: "bg-info-surface",    text: "text-info-ink",    label: "Internal" },
  personal:  { bg: "bg-warning-surface", text: "text-warning-ink", label: "Personal" },
  sensitive: { bg: "bg-caution-surface", text: "text-caution-ink", label: "Sensitive" },
  secret:    { bg: "bg-danger-surface",  text: "text-danger-ink",  label: "Secret" },
};

interface Props {
  level: string;
  size?: "sm" | "xs";
}

export default function SensitivityBadge({ level, size = "xs" }: Props) {
  const s = STYLES[level] || STYLES.internal;
  const cls = size === "sm"
    ? `text-xs px-2 py-0.5`
    : `text-xs px-1.5 py-0.5`;
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
