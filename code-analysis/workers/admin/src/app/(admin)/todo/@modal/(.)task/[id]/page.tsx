"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { TodoDialog } from "../../../components/todo/dialog";
import { projects } from "../../../data/data";
import { useTodoStore } from "../../../store/use-todo-store";

export default function TaskModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { todos, updateTodo } = useTodoStore();
  const { id } = use(params);

  const todo = todos.find((t) => t.id === id);

  return (
    <TodoDialog
      todo={todo || null}
      open={!!todo}
      onOpenChange={(open) => {
        if (!open) {
          router.back();
        }
      }}
      onUpdate={updateTodo}
      projects={projects}
    />
  );
}
