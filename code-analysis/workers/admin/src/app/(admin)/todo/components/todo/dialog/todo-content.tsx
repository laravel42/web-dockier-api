"use client";

import { cn } from "@/lib/utils";

import { Project, Todo } from "../../../data/data";
import { TodoDialogLeftColumn } from "./left-column";
import { TodoDialogRightColumn } from "./right-column";

interface TodoContentProps {
  todo: Todo;
  project: Project | undefined;
  onUpdate: (todo: Todo) => void;
  className?: string;
}

export function TodoContent({
  todo,
  project,
  onUpdate,
  className,
}: TodoContentProps) {
  console.log("TodoContent", todo.id);
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-8 md:gap-6", className)}>
      <div className="md:col-span-5">
        <TodoDialogLeftColumn
          localTodo={todo}
          onUpdate={onUpdate}
          setLocalTodo={(updatedTodo) => onUpdate(updatedTodo)}
        />
      </div>
      <div className="md:col-span-3">
        <TodoDialogRightColumn
          localTodo={todo}
          project={project}
          onUpdate={onUpdate}
          setLocalTodo={(updatedTodo) => onUpdate(updatedTodo)}
        />
      </div>
    </div>
  );
}
