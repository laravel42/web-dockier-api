"use client";

import { Inbox } from "lucide-react";
import * as React from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { TodoPageContent } from "../../components/todo/todo-page-content";
import { projects } from "../../data/data";
import { useTodoStore } from "../../store/use-todo-store";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = React.use(params);
  const { todos } = useTodoStore();
  const project = projects.find((p) => p.id === projectId);

  // Include both active and completed tasks for this project
  const activeTodos = todos.filter(
    (todo) => todo.projectId === projectId && !todo.deletedAt,
  );

  if (!project) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Project not found</EmptyTitle>
          <EmptyDescription>
            The project you&apos;re looking for doesn&apos;t exist.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <TodoPageContent
      activeTodos={activeTodos}
      defaultProjectId={projectId}
      emptyState={{
        icon: Inbox,
        title: `No tasks in ${project.name}`,
        description: "Get started by creating your first task.",
      }}
      sections={{
        active: {
          title: "Active Tasks",
        },
      }}
    />
  );
}
