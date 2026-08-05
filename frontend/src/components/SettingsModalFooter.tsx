import type { ReactNode } from "react";
import Button from "./ui/Button";
import { Trash2Icon } from "lucide-react";

interface SettingsModalFooterProps {
  children: ReactNode;
  onDelete?: () => void;
  /** Visible button text. Default: "Delete" */
  deleteLabel?: string;
  /** Accessible label for screen readers (e.g. "Remove Oscar from team"). */
  deleteAriaLabel?: string;
}

export default function SettingsModalFooter({
  children,
  onDelete,
  deleteLabel = "Delete",
  deleteAriaLabel,
}: SettingsModalFooterProps) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 pt-3 ${
        onDelete ? "justify-between" : "justify-end"
      }`}
    >
      {onDelete ? (
        <Button
          variant="outline-danger"
          size="sm"
          onClick={onDelete}
          iconLeft={<Trash2Icon className="size-4" />}
          aria-label={deleteAriaLabel}
        >
          {deleteLabel}
        </Button>
      ) : null}
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}
