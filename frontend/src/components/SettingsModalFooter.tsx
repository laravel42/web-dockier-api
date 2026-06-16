import type { ReactNode } from "react";
import TrashIcon from "./icons/outlined/TrashIcon";

interface SettingsModalFooterProps {
  children: ReactNode;
  onDelete?: () => void;
  deleteAriaLabel?: string;
}

export default function SettingsModalFooter({
  children,
  onDelete,
  deleteAriaLabel = "Remove",
}: SettingsModalFooterProps) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 border-t border-border pt-2 ${
        onDelete ? "justify-between" : "justify-end"
      }`}
    >
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="size-9 flex items-center justify-center rounded-md text-danger-500 hover:text-danger-600 hover:bg-danger-500/10 transition-colors shrink-0"
          aria-label={deleteAriaLabel}
        >
          <TrashIcon className="size-4" />
        </button>
      ) : null}
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}
