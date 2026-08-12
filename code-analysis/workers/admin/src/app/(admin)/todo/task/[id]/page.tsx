"use client";

import { ArrowLeft, Hash } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";

import { Button } from "@/components/ui/button";
import { todoRoutes } from "@/lib/todo-routes";

import { TodoContent } from "../../components/todo/dialog/todo-content";
import { projects } from "../../data/data";
import { useTodoStore } from "../../store/use-todo-store";

export default function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { todos, updateTodo } = useTodoStore();
  const { id } = use(params);
  const todo = todos.find((t) => t.id === id);

  if (!todo) {
    notFound();
  }

  const project = projects.find((p) => p.id === todo.projectId);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={todoRoutes.all}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Hash className="text-muted-foreground size-4" />
            <span className="text-sm font-medium">{project?.name}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <TodoContent
        todo={todo}
        project={project}
        onUpdate={updateTodo}
        className="gap-6"
      />
    </div>
  );
}
