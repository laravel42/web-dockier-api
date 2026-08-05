import { LayoutGridIcon, MenuIcon } from "lucide-react";

export type ViewMode = "cards" | "table";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewModeToggle({ mode, onChange }: Props) {
  const btnCls = (active: boolean) =>
    `p-1.5 rounded-md transition-colors ${
      active ? "bg-primary-500/10 text-text" : "text-text-muted hover:text-text"
    }`;

  return (
    <div className="flex items-center rounded-md border border-border/50 bg-card/30 p-0.5 h-9">
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={btnCls(mode === "cards")}
        title="Card view"
        aria-label="Card view"
        aria-pressed={mode === "cards"}
      >
        <LayoutGridIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        className={btnCls(mode === "table")}
        title="Table view"
        aria-label="Table view"
        aria-pressed={mode === "table"}
      >
        <MenuIcon className="size-4" />
      </button>
    </div>
  );
}
