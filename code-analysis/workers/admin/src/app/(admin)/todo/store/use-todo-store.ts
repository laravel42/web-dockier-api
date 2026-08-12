import { create } from "zustand";

import { initialLabels, initialTodos, Label, Todo } from "../data/data";
import type { Priority } from "../lib/config/priorities";

interface TodoStore {
  todos: Todo[];
  labels: Label[];
  toggleComplete: (id: string) => void;
  toggleStar: (id: string) => void;
  deleteTodo: (id: string) => void;
  toggleSubtask: (todoId: string, subtaskId: string) => void;
  updateTodo: (updatedTodo: Todo) => void;
  addTodo: (params: {
    title: string;
    description: string;
    projectId: string;
    starred?: boolean;
    dueDate?: Date;
    deadline?: Date;
    priority?: Priority;
    reminders?: Date[];
    subtasks?: Todo["subtasks"];
    labels?: string[];
    location?: string;
  }) => Todo;
  reorderTodos: (reorderedTodos: Todo[]) => void;
  addLabel: (name: string, color?: string) => Label;
  deleteLabel: (id: string) => void;
  updateLabel: (id: string, name: string, color?: string) => void;
}

export const useTodoStore = create<TodoStore>((set) => ({
  todos: initialTodos,
  labels: initialLabels,

  toggleComplete: (id) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              completed: !todo.completed,
              completedAt: !todo.completed ? new Date() : undefined,
            }
          : todo,
      ),
    })),

  toggleStar: (id) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, starred: !todo.starred } : todo,
      ),
    })),

  deleteTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, deletedAt: new Date() } : todo,
      ),
    })),

  toggleSubtask: (todoId, subtaskId) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              subtasks: todo.subtasks.map((subtask) =>
                subtask.id === subtaskId
                  ? { ...subtask, completed: !subtask.completed }
                  : subtask,
              ),
            }
          : todo,
      ),
    })),

  updateTodo: (updatedTodo) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === updatedTodo.id ? updatedTodo : todo,
      ),
    })),

  addTodo: (params) => {
    const {
      title,
      description,
      projectId,
      starred,
      dueDate,
      deadline,
      priority,
      reminders,
      subtasks,
      labels,
      location,
    } = params;

    const newTodo: Todo = {
      id: Date.now().toString(),
      title,
      description: description || undefined,
      completed: false,
      projectId,
      subtasks: subtasks ?? [],
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(starred !== undefined && { starred }),
      ...(dueDate !== undefined && { dueDate }),
      ...(deadline !== undefined && { deadline }),
      ...(priority !== undefined && { priority }),
      ...(reminders !== undefined && { reminders }),
      ...(labels !== undefined && labels.length > 0 && { labels }),
      ...(location !== undefined && location && { location }),
    };
    set((state) => ({ todos: [...state.todos, newTodo] }));
    return newTodo;
  },

  reorderTodos: (reorderedTodos) =>
    set(() => ({
      todos: reorderedTodos,
    })),

  addLabel: (name, color) => {
    const newLabel: Label = {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      color: color || "#3b82f6",
    };
    set((state) => ({
      labels: [...state.labels, newLabel],
    }));
    return newLabel;
  },

  deleteLabel: (id) =>
    set((state) => ({
      labels: state.labels.filter((label) => label.id !== id),
      todos: state.todos.map((todo) => ({
        ...todo,
        labels: todo.labels?.filter((labelId) => labelId !== id),
      })),
    })),

  updateLabel: (id, name, color) =>
    set((state) => ({
      labels: state.labels.map((label) =>
        label.id === id ? { ...label, name, color } : label,
      ),
    })),
}));
