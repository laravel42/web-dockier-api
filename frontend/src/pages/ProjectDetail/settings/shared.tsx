import { CheckIcon, CopyIcon } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

export { TabPanelHeader as SectionTitle } from "@/components/TabPanelHeader";

export function SettingsRow({
  label,
  description,
  children,
  border = true,
  stackOnMobile = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  border?: boolean;
  /** Below sm, put the control on its own row under the label instead of beside it. */
  stackOnMobile?: boolean;
}) {
  return (
    <div
      className={`flex px-4 py-3 ${
        stackOnMobile ? "flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0" : "items-center justify-between"
      } ${border ? "border-b border-border/50" : ""}`}
    >
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-text">{label}</p>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <div className={stackOnMobile ? "max-w-full sm:shrink-0" : "shrink-0"}>{children}</div>
    </div>
  );
}

export function CopyableField({ value }: { value: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <code className="flex-1 truncate text-xs font-mono text-text-muted">{value}</code>
      <button
        type="button"
        onClick={() => void copy(value)}
        className="shrink-0 text-text-muted hover:text-text transition-colors"
        title="Copy"
      >
        {copied !== null ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
    </div>
  );
}
