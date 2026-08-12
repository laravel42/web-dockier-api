import { Check, CheckCircle2, Circle, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type Subtask } from "../../data/data";

interface SubtaskListProps {
  subtasks: Subtask[];
  onToggleSubtask: (subtaskId: string) => void;
  variant?: "compact" | "full";
  onRemoveSubtask?: (subtaskId: string) => void;
  onAddSubtask?: (title: string) => void;
  className?: string;
}

/**
 * Reusable subtask list component
 * - compact: Shows first 3 subtasks (used in TodoItem)
 * - full: Shows all subtasks with add/remove functionality (used in TodoDialog)
 */
export function SubtaskList({
  subtasks,
  onToggleSubtask,
  variant = "compact",
  onRemoveSubtask,
  onAddSubtask,
  className,
}: SubtaskListProps) {
  const [isAddSubtaskOpen, setIsAddSubtaskOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const handleAddSubtaskSubmit = () => {
    if (!newSubtaskTitle.trim() || !onAddSubtask) return;
    onAddSubtask(newSubtaskTitle);
    setNewSubtaskTitle("");
    setIsAddSubtaskOpen(false);
  };

  if (variant === "compact") {
    return (
      <div className={cn("mt-1.5 space-y-0.5", className)}>
        {subtasks.slice(0, 3).map((subtask) => (
          <div
            key={subtask.id}
            className="group/subtask hover:bg-accent/20 -ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSubtask(subtask.id);
            }}
          >
            <button
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded border transition-all",
                subtask.completed
                  ? "bg-primary border-primary"
                  : "border-muted-foreground/30 hover:border-primary/50",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSubtask(subtask.id);
              }}
              aria-label={
                subtask.completed
                  ? "Mark subtask as incomplete"
                  : "Mark subtask as complete"
              }
            >
              {subtask.completed && (
                <Check
                  className="text-primary-foreground size-2.5"
                  strokeWidth={3}
                />
              )}
            </button>
            <span
              className={cn(
                "line-clamp-1 cursor-pointer text-xs transition-all select-none",
                subtask.completed
                  ? "text-muted-foreground/50 line-through"
                  : "text-muted-foreground",
              )}
            >
              {subtask.title}
            </span>
          </div>
        ))}
        {subtasks.length > 3 && (
          <div className="-ml-1 flex items-center gap-1.5 px-1 py-0.5">
            <div className="size-3.5" />
            <span className="text-muted-foreground/40 text-xs">
              +{subtasks.length - 3} more
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full variant with add/remove functionality
  return (
    <div className={className}>
      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          className="group border-border/50 flex items-center gap-1 border-b py-2 transition-colors first:pt-0 last:pb-0"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggleSubtask(subtask.id)}
            className="shrink-0 rounded-full"
          >
            {subtask.completed ? (
              <CheckCircle2 className="text-success size-4" />
            ) : (
              <Circle className="size-4" />
            )}
          </Button>
          <div className="flex flex-1 items-center justify-between gap-2">
            <p
              className={cn(
                "text-sm",
                subtask.completed ? "text-muted-foreground line-through" : "",
              )}
            >
              {subtask.title}
            </p>
            {onRemoveSubtask && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemoveSubtask(subtask.id)}
                className="text-destructive hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {onAddSubtask && (
        <div className="pt-2">
          {!isAddSubtaskOpen ? (
            <button
              className="text-muted-foreground flex w-full items-center justify-start gap-2 text-sm transition-all"
              onClick={() => setIsAddSubtaskOpen(true)}
            >
              <Plus className="size-4" />
              Add Subtask
            </button>
          ) : (
            <div className="animate-in fade-in space-y-2 duration-200">
              <Input
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddSubtaskSubmit();
                  } else if (e.key === "Escape") {
                    setIsAddSubtaskOpen(false);
                    setNewSubtaskTitle("");
                  }
                }}
                onBlur={() => {
                  if (!newSubtaskTitle.trim()) {
                    setIsAddSubtaskOpen(false);
                  }
                }}
                placeholder="Enter subtask title..."
                autoFocus
                className="transition-all"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAddSubtaskOpen(false);
                    setNewSubtaskTitle("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddSubtaskSubmit}
                  disabled={!newSubtaskTitle.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
