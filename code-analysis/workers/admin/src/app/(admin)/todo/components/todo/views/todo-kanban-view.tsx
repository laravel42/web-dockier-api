"use client";

import { CheckCircle2 } from "lucide-react";

import type { Project, Subtask, Todo } from "../../../data/data";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "../../kibo-ui/kanban";
import { PriorityFlag } from "../priority-flag";

// Kanban item must have id, name, and column properties
type TodoKanbanItem = {
  id: string;
  name: string;
  column: string;
} & Omit<Todo, "id">;

type KanbanColumn = {
  id: string;
  name: string;
};

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "no-priority", name: "No Priority" },
  { id: "P4", name: "Priority 4" },
  { id: "P3", name: "Priority 3" },
  { id: "P2", name: "Priority 2" },
  { id: "P1", name: "Priority 1" },
];

interface TodoKanbanViewProps {
  todos: Todo[];
  projects: Project[];
  onTodoClick: (todo: Todo) => void;
  onTodosReorder?: (todos: Todo[]) => void;
}

export function TodoKanbanView({
  todos,
  projects,
  onTodoClick,
  onTodosReorder,
}: TodoKanbanViewProps) {
  // Transform todos to kanban items
  const kanbanData: TodoKanbanItem[] = todos.map((todo) => ({
    ...todo,
    name: todo.title,
    column: todo.priority || "no-priority",
  }));

  const handleDataChange = (newData: TodoKanbanItem[]) => {
    // Update the priority based on the new column
    const updatedTodos = newData.map((item) => {
      const { column, ...todoData } = item;
      return {
        ...todoData,
        priority:
          column === "no-priority" ? undefined : (column as Todo["priority"]),
      };
    });
    onTodosReorder?.(updatedTodos);
  };

  const getProject = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  return (
    <div className="h-[calc(100vh-16rem)] w-full overflow-x-auto pb-4">
      <div className="inline-flex h-full gap-4">
        <KanbanProvider
          columns={KANBAN_COLUMNS}
          data={kanbanData}
          onDataChange={handleDataChange}
          className="contents"
        >
          {(column) => (
            <KanbanBoard
              key={column.id}
              id={column.id}
              className="w-60 shrink-0"
            >
              <KanbanHeader>
                <div className="flex items-center justify-between">
                  <span>{column.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {
                      kanbanData.filter((item) => item.column === column.id)
                        .length
                    }
                  </span>
                </div>
              </KanbanHeader>
              <KanbanCards id={column.id}>
                {(item) => {
                  const todoItem = item as TodoKanbanItem;
                  const project = getProject(todoItem.projectId);
                  return (
                    <KanbanCard
                      key={todoItem.id}
                      id={todoItem.id}
                      name={todoItem.title}
                      column={todoItem.column}
                    >
                      <div
                        className="space-y-2"
                        onClick={() => onTodoClick(todoItem)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="line-clamp-2 text-sm leading-snug font-medium">
                            {todoItem.title}
                          </h4>
                          {todoItem.priority && (
                            <PriorityFlag priority={todoItem.priority} />
                          )}
                        </div>

                        {todoItem.description && (
                          <p className="text-muted-foreground line-clamp-2 text-xs">
                            {todoItem.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          {project && (
                            <span className="text-muted-foreground text-xs">
                              {project.name}
                            </span>
                          )}

                          {todoItem.subtasks.length > 0 && (
                            <div className="flex items-center gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              <span className="text-muted-foreground">
                                {
                                  todoItem.subtasks.filter(
                                    (st: Subtask) => st.completed,
                                  ).length
                                }
                                /{todoItem.subtasks.length}
                              </span>
                            </div>
                          )}
                        </div>

                        {todoItem.dueDate && (
                          <div className="text-muted-foreground text-xs">
                            Due:{" "}
                            {new Date(todoItem.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </KanbanCard>
                  );
                }}
              </KanbanCards>
            </KanbanBoard>
          )}
        </KanbanProvider>
      </div>
    </div>
  );
}
