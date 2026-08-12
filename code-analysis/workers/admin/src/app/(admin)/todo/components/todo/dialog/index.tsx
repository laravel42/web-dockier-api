"use client";

import { ExternalLink, Hash, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { todoRoutes } from "@/lib/todo-routes";

import { Project, Todo } from "../../../data/data";
import { TodoContent } from "./todo-content";

interface TodoDialogProps {
  todo: Todo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (todo: Todo) => void;
  projects: Project[];
}

export function TodoDialog({
  todo,
  open,
  onOpenChange,
  onUpdate,
  projects,
}: TodoDialogProps) {
  const [localTodo, setLocalTodo] = useState<Todo | null>(null);

  useEffect(() => {
    if (todo) {
      setLocalTodo({ ...todo });
    }
  }, [todo]);

  if (!localTodo) return null;

  const project = projects.find((p) => p.id === localTodo.projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-full w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-w-xl sm:rounded-lg md:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Edit Task: {localTodo.title}</DialogTitle>
        </DialogHeader>

        {/* Custom Header */}
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Hash className="text-muted-foreground size-4" />
            <span className="text-sm font-medium">{project?.name}</span>
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a href={todoRoutes.task(localTodo.id)}>
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in full page</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Two Column Layout */}
        <TodoContent
          todo={localTodo}
          project={project}
          onUpdate={onUpdate}
          className="h-full overflow-y-auto sm:max-h-[calc(90vh-56px)] md:min-h-[600px]"
        />
      </DialogContent>
    </Dialog>
  );
}
