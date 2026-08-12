import type { ReactElement } from "react";

const STYLES: Record<string, { bg: string; text: string; border: string; icon: ReactElement }> = {
  error: {
    bg: "bg-danger-50", text: "text-danger-500", border: "border-danger-500/35",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="size-3 " viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" /></svg>,
  },
  warning: {
    bg: "bg-warning-50", text: "text-warning-500", border: "border-warning-500/35",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="size-3 " viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>,
  },
  info: {
    bg: "bg-sky-500/20", text: "text-sky-200", border: "border-sky-500/35",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="size-3 " viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" /></svg>,
  },
  clean: {
    bg: "bg-success-50", text: "text-success-500", border: "border-success-500/35",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="size-3 " viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>,
  },
};

const SEVERITY_LABELS: Record<string, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
  clean: "Clean",
};

interface Props {
  severity: "error" | "warning" | "info" | "clean";
  count?: number;
  label?: string;
  size?: "default" | "compact";
}

export default function SeverityBadge({ severity, count, label, size = "default" }: Props) {
  const s = STYLES[severity];
  if (!s) return null;
  const compact = size === "compact";
  const baseLabel = label ?? SEVERITY_LABELS[severity] ?? severity;
  const text = count !== undefined ? `${count} ${baseLabel}` : baseLabel;

  return (
    <span
      className={`inline-flex items-center border whitespace-nowrap font-medium ${s.border} ${s.bg} ${s.text} ${
        compact
          ? "gap-0.5 rounded px-1 py-px text-xs/tight "
          : "gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
      }`}
    >
      {!compact && s.icon}
      {text}
    </span>
  );
}
