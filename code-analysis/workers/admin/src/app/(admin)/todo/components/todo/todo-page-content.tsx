"use client";

import { ChevronDown, LucideIcon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { todoRoutes } from "@/lib/todo-routes";

import { useViewMode } from "../../contexts/view-mode-context";
import { projects, Todo } from "../../data/data";
import { useFilteredTodos } from "../../hooks/use-filtered-todos";
import type { Priority } from "../../lib/config/priorities";
import type { AddTodoCallback } from "../../lib/types/callbacks";
import { useTodoStore } from "../../store/use-todo-store";
import { AddTaskForm } from "./add-task-form";
import { SortableTodoList } from "./sortable-todo-list";
import { TodoCalendarView } from "./views/todo-calendar-view";
import { TodoKanbanView } from "./views/todo-kanban-view";
import {
  type SortOption,
  TodoFilters,
  TodoViewToolbar,
  type ViewMode,
} from "./views/todo-view-toolbar";

interface TodoPageContentProps {
  activeTodos: Todo[];
  emptyState: {
    icon: LucideIcon;
    title: string;
    description: string;
  };
  sections: {
    active: {
      title: string;
    };
  };
  onAddTodo?: AddTodoCallback;
  defaultDueDate?: Date;
  defaultProjectId?: string;
  defaultViewMode?: ViewMode;
}

export function TodoPageContent({
  activeTodos,
  emptyState,
  sections,
  onAddTodo: customOnAddTodo,
  defaultDueDate,
  defaultProjectId,
  defaultViewMode = "list",
}: TodoPageContentProps) {
  const router = useRouter();
  const { addTodo, reorderTodos } = useTodoStore();
  const { viewMode, setViewMode: setGlobalViewMode } = useViewMode();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    defaultProjectId || projects[0].id,
  );
  const [showFormFromEmpty, setShowFormFromEmpty] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("manual");
  const [filters, setFilters] = useState<TodoFilters>({
    projects: [],
    priorities: [],
    labels: [],
    starredOnly: false,
  });
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(true);

  // Set default view mode on mount
  useEffect(() => {
    setGlobalViewMode(defaultViewMode);
  }, [defaultViewMode, setGlobalViewMode]);

  // Sync local view mode changes with global context
  const handleViewModeChange = (mode: ViewMode) => {
    setGlobalViewMode(mode);
  };

  const handleTodoClick = (todo: Todo) => {
    router.push(todoRoutes.task(todo.id));
  };

  const handleAddTask = (
    title: string,
    description: string,
    dueDate?: Date,
    priority?: Priority,
    reminders?: Date[],
  ) => {
    if (customOnAddTodo) {
      customOnAddTodo(title, description, selectedProjectId, dueDate);
    } else {
      addTodo({
        title,
        description,
        projectId: selectedProjectId,
        dueDate,
        priority,
        reminders,
      });
    }
  };

  // Filter and sort todos
  const { filteredActiveTodos, filteredCompletedTodos } = useFilteredTodos({
    todos: activeTodos,
    filters,
    sortBy,
  });

  const hasTodos = activeTodos.length > 0;
  const EmptyIcon = emptyState.icon;

  return (
    <>
      {/* Scenario 1: No todos - show empty state or form */}
      {!hasTodos && !showFormFromEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <EmptyIcon />
            </EmptyMedia>
            <EmptyTitle>{emptyState.title}</EmptyTitle>
            <EmptyDescription>{emptyState.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setShowFormFromEmpty(true)}>
              <Plus className="h-4 w-4" />
              Add New Task
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {sections.active.title} ({filteredActiveTodos.length})
            </h2>
          </div>

          {/* Toolbar with view mode, filters, and sorting */}
          <TodoViewToolbar
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            sortBy={sortBy}
            onSortChange={setSortBy}
            filters={filters}
            onFiltersChange={setFilters}
            projects={projects}
            totalCount={
              filteredActiveTodos.length + filteredCompletedTodos.length
            }
          />

          {/* Render view based on selected mode */}
          {viewMode === "list" && (
            <div className="space-y-6">
              {/* Active Tasks Section */}
              <div>
                <SortableTodoList
                  todos={filteredActiveTodos}
                  projects={projects}
                  onTodoClick={handleTodoClick}
                  onDragStart={() => {
                    // Switch to manual sort when user starts dragging
                    if (sortBy !== "manual") {
                      setSortBy("manual");
                      toast.info("Switched to manual sort mode", {
                        description: "Your custom order will be preserved",
                        duration: 2000,
                      });
                    }
                  }}
                />
                <AddTaskForm
                  projects={projects}
                  selectedProjectId={selectedProjectId}
                  onAddTask={handleAddTask}
                  onProjectChange={setSelectedProjectId}
                  defaultDate={defaultDueDate}
                  initiallyExpanded={showFormFromEmpty}
                />
              </div>

              {/* Completed Tasks Section */}
              {filteredCompletedTodos.length > 0 && (
                <div className="border-border/50 space-y-3 border-t pt-6">
                  <button
                    onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
                    className="text-muted-foreground hover:text-foreground group flex w-full items-center gap-2 text-xs font-semibold tracking-wider uppercase transition-colors"
                  >
                    <ChevronDown
                      className={`text-muted-foreground size-3.5 transition-transform duration-200 ${
                        isCompletedExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <span>Completed</span>
                    <span className="bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                      {filteredCompletedTodos.length}
                    </span>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isCompletedExpanded
                        ? "max-h-[2000px] opacity-100"
                        : "max-h-0 opacity-0"
                    }`}
                  >
                    <SortableTodoList
                      todos={filteredCompletedTodos}
                      projects={projects}
                      onTodoClick={handleTodoClick}
                      enableDragAndDrop={false}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === "kanban" && (
            <TodoKanbanView
              todos={[...filteredActiveTodos, ...filteredCompletedTodos]}
              projects={projects}
              onTodoClick={handleTodoClick}
              onTodosReorder={reorderTodos}
            />
          )}

          {viewMode === "calendar" && (
            <TodoCalendarView
              todos={[...filteredActiveTodos, ...filteredCompletedTodos]}
              projects={projects}
              onTodoClick={handleTodoClick}
              onAddTask={(
                title,
                description,
                date,
                priority,
                reminders,
                projectId,
              ) => {
                const targetProjectId = projectId || selectedProjectId;
                if (customOnAddTodo) {
                  customOnAddTodo(title, description, targetProjectId, date);
                } else {
                  addTodo({
                    title,
                    description,
                    projectId: targetProjectId,
                    dueDate: date,
                    priority,
                    reminders,
                  });
                }
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
