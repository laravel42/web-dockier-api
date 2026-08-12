import { CheckCircle2, Circle } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { type Priority } from "../../lib/config/priorities";

interface TodoCheckboxProps {
  completed: boolean;
  priority?: Priority;
  title?: string;
  onToggle: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "default" | "success";
}

/**
 * Reusable checkbox component for todos and subtasks
 * Consolidates checkbox rendering logic across TodoItem and left-column
 */
export function TodoCheckbox({
  completed,
  priority,
  title,
  onToggle,
  size = "md",
  className,
  variant = "default",
}: TodoCheckboxProps) {
  const sizeClasses = {
    sm: "size-4",
    md: "size-5",
    lg: "size-6",
  };

  const iconSize = sizeClasses[size];
  const completedIconSize =
    completed && variant === "default" ? "size-4" : iconSize;
  const completedColor =
    variant === "success" ? "text-success" : "text-muted-foreground";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "shrink-0 rounded-full transition-all duration-200",
        completed && variant === "default" && "scale-90",
        className,
      )}
      aria-label={
        completed
          ? `Mark ${title ? `"${title}"` : "task"} as incomplete`
          : `Mark ${title ? `"${title}"` : "task"} as complete`
      }
    >
      <div className="relative">
        {/* Uncompleted circle - fade out when completed */}
        <motion.div
          initial={false}
          animate={{
            scale: completed ? 0.8 : 1,
            opacity: completed ? 0 : 1,
          }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={completed ? "absolute inset-0" : ""}
        >
          <Circle
            className={cn(
              iconSize,
              priority === "P1" && "text-priority-1",
              priority === "P2" && "text-priority-2",
              priority === "P3" && "text-priority-3",
              priority === "P4" && "text-priority-4",
            )}
          />
        </motion.div>

        {/* Completed check - scale in with spring animation */}
        {completed && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 20,
              duration: 0.3,
            }}
          >
            <CheckCircle2
              className={cn(completedColor, completedIconSize)}
              strokeWidth={2}
            />
          </motion.div>
        )}
      </div>
    </Button>
  );
}
