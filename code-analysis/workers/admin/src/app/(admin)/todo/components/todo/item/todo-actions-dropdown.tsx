"use client";

import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Calendar,
  Copy,
  Edit,
  MoreVertical,
  Move,
  Plus,
  Puzzle,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useKeyPress } from "@/hooks/use-key-press";
import { todoAbsoluteUrl, todoRoutes } from "@/lib/todo-routes";
import { cn } from "@/lib/utils";

import { Todo } from "../../../data/data";
import type { Priority } from "../../../lib/config/priorities";
import { getPriorityLabel, PRIORITIES } from "../../../lib/config/priorities";
import { getPresetDate } from "../../../lib/date-utils";
import { useTodoStore } from "../../../store/use-todo-store";
import { PriorityFlag } from "../priority-flag";

interface TodoActionsDropdownProps {
  todo: Todo;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onClick: (todo: Todo) => void;
}

export function TodoActionsDropdown({
  todo,
  isOpen,
  onOpenChange,
  onClick,
}: TodoActionsDropdownProps) {
  const { toggleStar, deleteTodo, updateTodo } = useTodoStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Date options configuration
  const dateOptions = [
    { type: "today" as const, label: "Today", color: "text-chart-1" },
    { type: "tomorrow" as const, label: "Tomorrow", color: "text-chart-2" },
    { type: "next-week" as const, label: "Next week", color: "text-chart-3" },
    { type: "next-month" as const, label: "Next month", color: "text-chart-4" },
    { type: "no-date" as const, label: "No date", color: "text-chart-5" },
  ];

  // Use centralized priority configuration
  const priorityOptions = PRIORITIES.map((p) => ({
    value: p.value,
    label: getPriorityLabel(p.value, "short"),
  }));

  // Helper functions to set dates
  const setDate = (
    dateType: "today" | "tomorrow" | "next-week" | "next-month" | "no-date",
  ) => {
    const newDate = getPresetDate(dateType);
    updateTodo({ ...todo, dueDate: newDate });
  };

  const setPriority = (priority: Priority) => {
    updateTodo({ ...todo, priority });
  };

  // Copy link to task function
  const handleCopyLink = useCallback(() => {
    const taskUrl = todoAbsoluteUrl(todoRoutes.task(todo.id));
    navigator.clipboard.writeText(taskUrl);
    toast.success("Task link copied to clipboard");
  }, [todo.id]);

  // Keyboard shortcuts
  // Edit task: Cmd/Ctrl + E
  useKeyPress(
    () => {
      onClick(todo);
      onOpenChange(false);
    },
    ["KeyE"],
    { metaKey: true },
  );

  // Move to: V
  useKeyPress(
    () => {
      // TODO: Implement move functionality
      console.log("Move task:", todo.id);
    },
    ["KeyV"],
    {},
  );

  // Copy link: Cmd/Ctrl + Shift + L (only when dropdown is open)
  useKeyPress(
    () => {
      if (isOpen) {
        handleCopyLink();
      }
    },
    ["KeyL"],
    { metaKey: true, shiftKey: true },
  );

  // Delete: Cmd/Ctrl + Backspace
  useKeyPress(
    () => {
      setShowDeleteDialog(true);
      onOpenChange(false);
    },
    ["Backspace"],
    { metaKey: true },
  );

  return (
    <>
      <DropdownMenu modal={false} open={isOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
            }}
            aria-label="More actions"
            className={cn(
              "-mr-2 transition-all duration-200 ease-out",
              "-translate-x-2 scale-50 opacity-0",
              "group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100",
              isOpen && "translate-x-0 scale-100 opacity-100",
            )}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-64"
        >
          {/* Task Positioning Actions */}
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <ArrowUp className="size-4" />
            Add task above
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <ArrowDown className="size-4" />
            Add task below
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Core Task Action */}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onClick(todo);
              onOpenChange(false);
            }}
          >
            <Edit className="size-4" />
            Edit
            <span className="text-muted-foreground ml-auto text-xs">⌘ E</span>
          </DropdownMenuItem>

          {/* Date Section */}
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Date</span>
              <span className="text-muted-foreground text-xs">T</span>
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="mt-1 flex items-center gap-3">
                {dateOptions.map((option) => (
                  <Tooltip key={option.type}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDate(option.type);
                        }}
                        className="hover:bg-accent cursor-pointer rounded p-1 transition-colors"
                      >
                        <Calendar className={`${option.color} size-4`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{option.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          {/* Priority Section */}
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Priority</span>
              <span className="text-muted-foreground text-xs">Y</span>
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="mt-1 flex items-center gap-3">
                {priorityOptions.map((option) => (
                  <Tooltip key={option.value}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPriority(option.value);
                        }}
                      >
                        <PriorityFlag
                          priority={option.value}
                          className="size-4"
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{option.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <DropdownMenuSeparator />

          {/* Additional Task Actions */}
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <AlarmClock className="size-4" />
            Reminders
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <Move className="size-4" />
            Move to...
            <span className="text-muted-foreground ml-auto text-xs">V</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <Plus className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopyLink();
            }}
          >
            <Copy className="size-4" />
            Copy link to task
            <span className="text-muted-foreground ml-auto text-xs">⇧ ⌘ L</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Extension */}
          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
            <Puzzle className="size-4" />
            Add extension...
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Keep the favorite item */}
          {!todo.completed && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStar(todo.id);
                }}
              >
                <Star
                  className={cn(
                    "size-4",
                    todo.starred &&
                      "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400",
                  )}
                />
                {todo.starred ? "Remove from favorites" : "Add to favorites"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Delete */}
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
              setShowDeleteDialog(true);
            }}
          >
            <Trash2 className="size-4" />
            Delete
            <span className="text-muted-foreground ml-auto text-xs">⌘ ⌫</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              The Schedule this task 📅 <strong>{todo.title}</strong> will be
              permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                deleteTodo(todo.id);
                setShowDeleteDialog(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
