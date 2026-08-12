"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";

import { Project, Todo } from "../../data/data";
import { useTodoStore } from "../../store/use-todo-store";
import { TodoItem } from "./item";

interface SortableTodoItemProps {
  todo: Todo;
  project?: Project;
  onClick: (todo: Todo) => void;
  onRestore?: (todoId: string) => void;
}

function SortableTodoItem({
  todo,
  project,
  onClick,
  onRestore,
}: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.2 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TodoItem
        todo={todo}
        project={project}
        onClick={onClick}
        dragAttributes={attributes}
        dragListeners={listeners}
        isDragging={isDragging}
        onRestore={onRestore}
      />
    </div>
  );
}

interface SortableTodoListProps {
  todos: Todo[];
  projects: Project[];
  onTodoClick: (todo: Todo) => void;
  enableDragAndDrop?: boolean;
  onRestore?: (todoId: string) => void;
  onDragStart?: () => void;
}

export function SortableTodoList({
  todos,
  projects,
  onTodoClick,
  enableDragAndDrop = true,
  onRestore,
  onDragStart: onDragStartCallback,
}: SortableTodoListProps) {
  const { todos: allTodos, reorderTodos } = useTodoStore();
  const [mounted, setMounted] = useState(false);
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const todo = allTodos.find((t) => t.id === active.id);
    setActiveTodo(todo || null);

    // Notify parent that drag has started (to switch to manual sort)
    if (onDragStartCallback) {
      onDragStartCallback();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Find indices in allTodos (the full store)
      const oldIndex = allTodos.findIndex((t) => t.id === active.id);
      const newIndex = allTodos.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder the entire todos array in the store
        const reordered = arrayMove(allTodos, oldIndex, newIndex);
        reorderTodos(reordered);
      }
    }

    setActiveTodo(null);
  };

  // Prevent hydration mismatch by only rendering DnD on client, or if drag and drop is disabled
  if (!mounted || !enableDragAndDrop) {
    return (
      <div className="[&>*:last-child_[data-slot=item]]:border-b-0">
        {todos.map((todo) => {
          const project = projects.find((p) => p.id === todo.projectId);
          return (
            <TodoItem
              key={todo.id}
              todo={todo}
              project={project}
              onClick={onTodoClick}
              onRestore={onRestore}
            />
          );
        })}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={todos.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="[&>*:last-child_[data-slot=item]]:border-b-0">
          {todos.map((todo) => {
            const project = projects.find((p) => p.id === todo.projectId);
            return (
              <SortableTodoItem
                key={todo.id}
                todo={todo}
                project={project}
                onClick={onTodoClick}
                onRestore={onRestore}
              />
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeTodo ? (
          <div className="relative cursor-grabbing">
            <div className="border-primary/50 bg-accent/50 absolute inset-0 -z-10 rounded-md border-2 backdrop-blur-sm" />
            <TodoItem
              todo={activeTodo}
              project={projects.find((p) => p.id === activeTodo.projectId)}
              onClick={() => {}}
              isDragging={true}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
