import { Project, Todo } from "../data/data";

export function getProjectById(
  projects: Project[],
  projectId: string,
): Project | undefined {
  return projects.find((p) => p.id === projectId);
}

export type SortOption =
  | "manual"
  | "dueDate"
  | "priority"
  | "title"
  | "createdAt"
  | "updatedAt";

/**
 * Sort todos based on the selected sort option
 * DRY utility function to avoid duplicating sort logic
 */
export function sortTodos(todos: Todo[], sortBy: SortOption): Todo[] {
  if (sortBy === "manual") return todos;

  return [...todos].sort((a, b) => {
    switch (sortBy) {
      case "dueDate":
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();

      case "priority": {
        const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4 };
        const aPriority = a.priority ? priorityOrder[a.priority] : 5;
        const bPriority = b.priority ? priorityOrder[b.priority] : 5;
        return aPriority - bPriority;
      }

      case "title":
        return a.title.localeCompare(b.title);

      case "createdAt":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      case "updatedAt":
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

      default:
        return 0;
    }
  });
}

/**
 * Sort todos with completed tasks at the bottom
 * Active tasks are sorted first, then completed tasks (sorted by completion time)
 */
export function sortTodosWithCompletedAtBottom(
  todos: Todo[],
  sortBy: SortOption,
): Todo[] {
  // Separate completed and active tasks
  const completedTasks = todos.filter((todo) => todo.completed);
  const activeTasks = todos.filter((todo) => !todo.completed);

  // Sort both groups
  const sortedActiveTasks = sortTodos(activeTasks, sortBy);
  const sortedCompletedTasks = sortTodos(completedTasks, sortBy).sort(
    (a, b) => {
      // Within completed tasks, sort by completedAt (earliest first)
      if (!a.completedAt || !b.completedAt) return 0;
      return (
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
      );
    },
  );

  // Combine: active tasks first, then completed tasks
  return [...sortedActiveTasks, ...sortedCompletedTasks];
}
