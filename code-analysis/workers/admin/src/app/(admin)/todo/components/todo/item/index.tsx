"use client";

import {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  ChevronRight,
  GripVertical,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { Project, Todo } from "../../../data/data";
import { useTodoStore } from "../../../store/use-todo-store";
import { AnimatedStrikethrough } from "../../common/animated-strikethrough";
import { DateTimeDisplay } from "../../date/date-time-display";
import { SubtaskList } from "../subtask-list";
import { TodoCheckbox } from "../todo-checkbox";
import { TodoActionsDropdown } from "./todo-actions-dropdown";

// Animation timing constants
const COMPLETION_ANIMATION_DELAY = 800; // ms: 300ms checkbox + 500ms strikethrough

interface TodoItemProps {
  todo: Todo;
  project?: Project;
  onClick: (todo: Todo) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  isDragging?: boolean;
  onRestore?: (todoId: string) => void;
}

export function TodoItem({
  todo,
  project,
  onClick,
  dragAttributes,
  dragListeners,
  isDragging,
  onRestore,
}: TodoItemProps) {
  const { toggleComplete, toggleSubtask } = useTodoStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [animatingToCompleted, setAnimatingToCompleted] = useState(false);

  const hasInfo =
    (project ||
      todo.comments.length > 0 ||
      (todo.labels && todo.labels.length > 0)) &&
    !todo.completed &&
    !animatingToCompleted;

  const handleToggleSubtask = (subtaskId: string) => {
    const subtask = todo.subtasks.find((st) => st.id === subtaskId);
    toggleSubtask(todo.id, subtaskId);
    if (subtask && !subtask.completed) {
      toast.success("Subtask completed! ✓", {
        description: `"${subtask.title}" marked as complete`,
      });
    }
  };

  const handleToggleComplete = () => {
    if (todo.completed) {
      // If uncompleting, do it immediately
      toggleComplete(todo.id);
      setAnimatingToCompleted(false);
    } else {
      // If completing, start animation and delay state change
      setAnimatingToCompleted(true);

      // Wait for animations to complete
      setTimeout(() => {
        toggleComplete(todo.id);
        toast.success("Task completed! 🎉", {
          description: `"${todo.title}" marked as complete`,
        });
        setAnimatingToCompleted(false);
      }, COMPLETION_ANIMATION_DELAY);
    }
  };

  return (
    <motion.div
      layout
      transition={{
        layout: { type: "spring", stiffness: 300, damping: 30 },
        duration: 0.2,
        ease: "easeOut",
      }}
      layoutId={`todo-item-${todo.id}`}
    >
      <Item
        variant={todo.completed || animatingToCompleted ? "muted" : "default"}
        className={`group border-border cursor-pointer items-start rounded-none border-0 border-b py-2 ${
          todo.completed || animatingToCompleted
            ? "opacity-60 hover:opacity-80"
            : ""
        }`}
        onClick={() => onClick(todo)}
      >
        <ItemMedia>
          <div className="flex items-center gap-0.5">
            <div className="relative flex items-center">
              {todo.subtasks.length > 0 &&
                !todo.completed &&
                !animatingToCompleted &&
                !isDragging && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSubtasksExpanded(!isSubtasksExpanded);
                    }}
                    className="absolute -left-8"
                    aria-label={
                      isSubtasksExpanded
                        ? "Collapse subtasks"
                        : "Expand subtasks"
                    }
                  >
                    <ChevronRight
                      className={cn(
                        "text-muted-foreground size-4 transition-transform duration-200",
                        isSubtasksExpanded && "rotate-90",
                      )}
                    />
                  </Button>
                )}
              {dragAttributes && dragListeners && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  {...dragAttributes}
                  {...dragListeners}
                  className={cn(
                    "absolute -translate-x-1 scale-50 opacity-0 group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100",
                    todo.subtasks.length > 0 ? "-left-14" : "-left-8",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="text-muted-foreground size-4" />
                </Button>
              )}
            </div>
            <TodoCheckbox
              completed={todo.completed || animatingToCompleted}
              priority={todo.priority}
              title={todo.title}
              onToggle={handleToggleComplete}
              className={cn(
                "-ml-1",
                (todo.completed || animatingToCompleted) && "-mr-2",
              )}
            />
          </div>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <ItemTitle
                className={cn(
                  "flex-1",
                  (todo.completed || animatingToCompleted) &&
                    "text-muted-foreground",
                )}
              >
                <AnimatedStrikethrough
                  completed={todo.completed || animatingToCompleted}
                >
                  {todo.title}
                </AnimatedStrikethrough>
              </ItemTitle>
              <div className="flex shrink-0 items-center gap-1">
                {!todo.completed && !animatingToCompleted && (
                  <DateTimeDisplay
                    date={todo.dueDate || todo.deadline}
                    showTime={true}
                  />
                )}
                {!todo.deletedAt ? (
                  <div
                    className={
                      todo.completed
                        ? "opacity-0 transition-opacity group-hover:opacity-100"
                        : ""
                    }
                  >
                    <TodoActionsDropdown
                      todo={todo}
                      isOpen={isDropdownOpen}
                      onOpenChange={setIsDropdownOpen}
                      onClick={onClick}
                    />
                  </div>
                ) : (
                  onRestore && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestore(todo.id);
                            }}
                            aria-label="Restore task"
                            className={cn(
                              "-mr-2 transition-all duration-200 ease-out",
                              "-translate-x-2 scale-50 opacity-0",
                              "group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100",
                            )}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Restore</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                )}
              </div>
            </div>

            {hasInfo && (
              <div className="text-muted-foreground/60 mt-0.5 flex items-center gap-1 text-xs">
                {project && <span>{project.name}</span>}
                {project &&
                  (todo.comments.length > 0 ||
                    (todo.labels && todo.labels.length > 0)) && <span>·</span>}
                {todo.comments.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="size-3" />
                    {todo.comments.length}
                  </span>
                )}
                {todo.comments.length > 0 &&
                  todo.labels &&
                  todo.labels.length > 0 && <span>·</span>}
                {todo.labels && todo.labels.length > 0 && (
                  <span>#{todo.labels[0]}</span>
                )}
              </div>
            )}

            {todo.subtasks.length > 0 &&
              !todo.completed &&
              !animatingToCompleted && (
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isSubtasksExpanded
                      ? "max-h-96 opacity-100"
                      : "max-h-0 opacity-0",
                  )}
                >
                  <SubtaskList
                    subtasks={todo.subtasks}
                    onToggleSubtask={handleToggleSubtask}
                    variant="compact"
                  />
                </div>
              )}
          </div>
        </ItemContent>
      </Item>
    </motion.div>
  );
}
