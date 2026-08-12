"use client";

import { CalendarClock } from "lucide-react";
import * as React from "react";

import { TodoPageContent } from "../components/todo/todo-page-content";
import { useTodoStore } from "../store/use-todo-store";

const isUpcoming = (date?: Date) => {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  return targetDate > today && targetDate <= sevenDaysFromNow;
};

export default function UpcomingPage() {
  const { todos, addTodo } = useTodoStore();

  const tomorrow = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date;
  }, []);

  // Include both active and completed upcoming tasks
  const activeTodos = todos.filter(
    (todo) =>
      !todo.deletedAt &&
      (isUpcoming(todo.dueDate) || isUpcoming(todo.deadline)),
  );

  const handleAddTodo = React.useCallback(
    (title: string, description: string, projectId: string, dueDate?: Date) => {
      const taskDate = dueDate || tomorrow;
      addTodo({
        title,
        description,
        projectId,
        dueDate: taskDate,
      });
    },
    [addTodo, tomorrow],
  );

  return (
    <TodoPageContent
      activeTodos={activeTodos}
      onAddTodo={handleAddTodo}
      defaultDueDate={tomorrow}
      defaultViewMode="calendar"
      emptyState={{
        icon: CalendarClock,
        title: "No upcoming tasks",
        description: "No tasks scheduled for the next 7 days.",
      }}
      sections={{
        active: {
          title: "Next 7 Days",
        },
      }}
    />
  );
}
