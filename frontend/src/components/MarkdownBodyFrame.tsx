import type { ReactNode } from "react";

export type MarkdownBodyView = "preview" | "raw";

interface SwitchProps {
  value: MarkdownBodyView;
  onChange: (view: MarkdownBodyView) => void;
  className?: string;
}

/** Preview / Raw segmented control — shared by PR body and project overview. */
export function MarkdownBodySwitch({ value, onChange, className = "" }: SwitchProps) {
  return (
    <div
      className={`inline-flex rounded-md border border-border/60 bg-card/95 p-0.5 shadow-(--shadow-xs) backdrop-blur ${className}`.trim()}
      role="group"
      aria-label="Body view"
    >
      <button
        type="button"
        onClick={() => onChange("preview")}
        aria-pressed={value === "preview"}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
          value === "preview" ? "bg-primary/15 text-text" : "text-text-muted hover:text-text"
        }`}
      >
        Preview
      </button>
      <button
        type="button"
        onClick={() => onChange("raw")}
        aria-pressed={value === "raw"}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
          value === "raw" ? "bg-primary/15 text-text" : "text-text-muted hover:text-text"
        }`}
      >
        Raw
      </button>
    </div>
  );
}

interface FrameProps {
  view: MarkdownBodyView;
  onViewChange: (view: MarkdownBodyView) => void;
  preview: ReactNode;
  raw: ReactNode;
  className?: string;
  /** When false, skip the bordered card chrome (e.g. overview panel already framed). */
  framed?: boolean;
}

/**
 * Scrollable body with a sticky top-right Preview/Raw switch.
 * Both panes stay mounted (toggled via `hidden`) to avoid remount flicker.
 */
export function MarkdownBodyFrame({
  view,
  onViewChange,
  preview,
  raw,
  className = "",
  framed = true,
}: FrameProps) {
  return (
    <div
      className={
        framed
          ? `relative overflow-y-auto rounded-lg border border-border/50 bg-secondary-50/30 p-3 ${className}`.trim()
          : `relative min-h-0 flex-1 ${className}`.trim()
      }
    >
      <div className="sticky top-0 float-right z-10 mb-1 ml-2">
        <MarkdownBodySwitch value={view} onChange={onViewChange} />
      </div>
      <div className={view === "preview" ? "block" : "hidden"} aria-hidden={view !== "preview"}>
        {preview}
      </div>
      <div className={view === "raw" ? "block" : "hidden"} aria-hidden={view !== "raw"}>
        {raw}
      </div>
    </div>
  );
}
