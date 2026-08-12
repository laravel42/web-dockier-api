"use client";

import { Calendar } from "lucide-react";
import * as React from "react";

import { TodoPageContent } from "../components/todo/todo-page-content";
import { useTodoStore } from "../store/use-todo-store";

const isToday = (date?: Date) => {
  if (!date) return false;
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

export default function TodayPage() {
  const { todos, addTodo } = useTodoStore();

  // Include both active and completed tasks for today
  const activeTodos = todos.filter(
    (todo) =>
      !todo.deletedAt && (isToday(todo.dueDate) || isToday(todo.deadline)),
  );

  const handleAddTodo = React.useCallback(
    (title: string, description: string, projectId: string, dueDate?: Date) => {
      const today = dueDate || new Date();
      addTodo({
        title,
        description,
        projectId,
        dueDate: today,
      });
    },
    [addTodo],
  );

  return (
    <TodoPageContent
      activeTodos={activeTodos}
      onAddTodo={handleAddTodo}
      defaultDueDate={new Date()}
      emptyState={{
        icon: Calendar,
        title: "No tasks due today",
        description: "You're all caught up! No tasks are due today.",
      }}
      sections={{
        active: {
          title: "Due Today",
        },
      }}
    />
  );
}
