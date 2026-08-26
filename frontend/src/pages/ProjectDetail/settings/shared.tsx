import { useState } from "react";
import Spinner from "@/components/Spinner";
import { CheckIcon, CopyIcon } from "lucide-react";

export { TabPanelHeader as SectionTitle } from "@/components/TabPanelHeader";

export function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  border = true,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${border ? "border-b border-border/50" : ""}`}>
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-text">{label}</p>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function CopyableField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <code className="flex-1 truncate text-xs font-mono text-text-muted">{value}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 text-text-muted hover:text-text transition-colors"
        title="Copy"
      >
        {copied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
    </div>
  );
}
