import { useState } from "react";
import Spinner from "@/components/Spinner";
import { CheckIcon, CopyIcon } from "lucide-react";

export const PROJECT_COLORS = [
  "#d9af7f", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  linkText,
  linkHref,
}: {
  title: string;
  description?: string;
  linkText?: string;
  linkHref?: string;
}) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && (
        <p className="mt-1 text-xs/relaxed text-text-muted">
          {description}
          {linkText && linkHref && (
            <>
              {" "}
              <a href={linkHref} className="text-primary-500 hover:text-primary-400 transition-colors">
                {linkText}
              </a>
            </>
          )}
        </p>
      )}
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

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-primary-500" : "bg-secondary-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
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
