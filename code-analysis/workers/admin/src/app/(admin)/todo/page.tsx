"use client";

import { Inbox } from "lucide-react";

import { TodoPageContent } from "./components/todo/todo-page-content";
import { useTodoStore } from "./store/use-todo-store";

export default function Page() {
  const { todos } = useTodoStore();

  // Include both active and completed tasks (exclude only deleted)
  const activeTodos = todos.filter((todo) => !todo.deletedAt);

  return (
    <TodoPageContent
      activeTodos={activeTodos}
      emptyState={{
        icon: Inbox,
        title: "No tasks yet",
        description: "Get started by creating your first task.",
      }}
      sections={{
        active: {
          title: "All Tasks",
        },
      }}
    />
  );
}
