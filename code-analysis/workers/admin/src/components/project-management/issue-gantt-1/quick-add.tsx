import { Plus } from "lucide-react";
import { useEffect } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type IssueGanttQuickAddProps = {
  isOpen: boolean;
  projectIdentifier: string;
  title: string;
  onTitleChange: (value: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function IssueGanttQuickAdd(props: IssueGanttQuickAddProps) {
  const {
    isOpen,
    projectIdentifier,
    title,
    onTitleChange,
    onOpen,
    onClose,
    onSubmit,
  } = props;

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return (
      <div className="bg-background sticky bottom-0 z-[1] border-t">
        <button
          type="button"
          className="hover:bg-muted/40 flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
          onClick={onOpen}
        >
          <Plus className="size-3.5" />
          New issue
        </button>
      </div>
    );
  }

  return (
    <div className="bg-background sticky bottom-0 z-[1] border-t shadow-sm">
      <div className="border-b px-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex w-full items-center gap-x-3"
        >
          <div className="flex w-full items-center gap-3">
            <div className="text-muted-foreground text-[11px] font-medium">
              {projectIdentifier}
            </div>
            <Input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Issue title"
              className={cn(
                "h-[42px] rounded-none border-0 bg-transparent px-2 py-3 text-[13px] font-medium shadow-none focus-visible:ring-0",
                "placeholder:text-muted-foreground/80",
              )}
            />
          </div>
        </form>
      </div>
      <div className="text-muted-foreground px-3 py-2 text-[11px] italic">
        Press Enter to add another issue
      </div>
    </div>
  );
}
