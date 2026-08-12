/**
 * Shared callback types for the application
 * Improves type safety and consistency across components
 */

import type { Priority } from "../config/priorities";

/**
 * Callback for adding a new todo
 * @param title - The title of the todo
 * @param description - Optional description of the todo
 * @param projectId - The ID of the project the todo belongs to
 * @param dueDate - Optional due date for the todo
 */
export type AddTodoCallback = (
  title: string,
  description: string,
  projectId: string,
  dueDate?: Date,
) => void;

/**
 * Callback for adding a todo with a specific date (used in calendar view)
 * @param title - The title of the todo
 * @param description - Optional description of the todo
 * @param date - Optional date for the todo
 * @param priority - Optional priority for the todo
 * @param reminders - Optional reminders for the todo
 * @param projectId - The ID of the project the todo belongs to
 */
export type AddTodoWithDateCallback = (
  title: string,
  description: string,
  date?: Date,
  priority?: Priority,
  reminders?: Date[],
  projectId?: string,
) => void;

/**
 * Callback for basic add task action (simplified version)
 * @param title - The title of the task
 * @param description - Optional description of the task
 * @param dueDate - Optional due date for the task
 * @param priority - Optional priority for the task
 * @param reminders - Optional reminders for the task
 */
export type AddTaskCallback = (
  title: string,
  description: string,
  dueDate?: Date,
  priority?: Priority,
  reminders?: Date[],
) => void;
