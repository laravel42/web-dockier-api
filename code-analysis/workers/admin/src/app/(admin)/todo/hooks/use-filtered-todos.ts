import { useMemo } from "react";

import type { TodoFilters } from "../components/todo/views/todo-view-toolbar";
import type { Todo } from "../data/data";
import { type SortOption, sortTodos } from "../lib/todo-utils";

export interface UseFilteredTodosOptions {
  todos: Todo[];
  filters: TodoFilters;
  sortBy: SortOption;
}

export interface UseFilteredTodosResult {
  filteredActiveTodos: Todo[];
  filteredCompletedTodos: Todo[];
}

/**
 * Custom hook to filter and sort todos
 * Separates active and completed todos, applies filters, and sorts both groups
 */
export function useFilteredTodos({
  todos,
  filters,
  sortBy,
}: UseFilteredTodosOptions): UseFilteredTodosResult {
  return useMemo(() => {
    let result = [...todos];

    // Apply filters
    if (filters.starredOnly) {
      result = result.filter((todo) => todo.starred);
    }
    if (filters.projects.length > 0) {
      result = result.filter((todo) =>
        filters.projects.includes(todo.projectId),
      );
    }
    if (filters.priorities.length > 0) {
      result = result.filter((todo) =>
        todo.priority ? filters.priorities.includes(todo.priority) : false,
      );
    }

    // Separate active and completed
    const completedTasks = result.filter((todo) => todo.completed);
    const activeTasks = result.filter((todo) => !todo.completed);

    // Sort both groups
    const sortedActive = sortTodos(activeTasks, sortBy);
    const sortedCompleted = sortTodos(completedTasks, sortBy);

    return {
      filteredActiveTodos: sortedActive,
      filteredCompletedTodos: sortedCompleted,
    };
  }, [todos, filters, sortBy]);
}
