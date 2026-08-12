"use client";

import { Sparkles } from "lucide-react";
import * as React from "react";

import { TodoPageContent } from "../components/todo/todo-page-content";
import { useTodoStore } from "../store/use-todo-store";

export default function ImportantPage() {
  const { todos, addTodo } = useTodoStore();

  // Include both active and completed important tasks
  const activeTodos = todos.filter((todo) => todo.starred && !todo.deletedAt);

  const handleAddTodo = React.useCallback(
    (title: string, description: string, projectId: string, dueDate?: Date) => {
      addTodo({
        title,
        description,
        projectId,
        starred: true,
        dueDate,
      });
    },
    [addTodo],
  );

  return (
    <TodoPageContent
      activeTodos={activeTodos}
      onAddTodo={handleAddTodo}
      emptyState={{
        icon: Sparkles,
        title: "No important tasks",
        description: "Star tasks to mark them as important.",
      }}
      sections={{
        active: {
          title: "Important Tasks",
        },
      }}
    />
  );
}
