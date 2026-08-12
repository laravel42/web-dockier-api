"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { todoRoutes } from "@/lib/todo-routes";

import { SortableTodoList } from "../components/todo/sortable-todo-list";
import { projects, Todo } from "../data/data";
import { useTodoStore } from "../store/use-todo-store";

export default function DeletedPage() {
  const router = useRouter();
  const { todos, updateTodo } = useTodoStore();

  const deletedTodos = todos.filter((todo) => todo.deletedAt);

  const handleTodoClick = (todo: Todo) => {
    router.push(todoRoutes.task(todo.id));
  };

  if (deletedTodos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trash2 />
          </EmptyMedia>
          <EmptyTitle>No deleted tasks</EmptyTitle>
          <EmptyDescription>
            Your deleted tasks will appear here
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Deleted Tasks ({deletedTodos.length})
          </h2>
        </div>

        <div>
          <SortableTodoList
            todos={deletedTodos}
            projects={projects}
            onTodoClick={handleTodoClick}
            enableDragAndDrop={false}
            onRestore={(todoId) => {
              const todo = deletedTodos.find((t) => t.id === todoId);
              if (todo) {
                updateTodo({ ...todo, deletedAt: undefined });
                toast.success("Task restored");
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
