"use client";

import {
  Calendar,
  CheckCircle2,
  Circle,
  FolderKanban,
  Hash,
  Inbox,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { todoRoutes } from "@/lib/todo-routes";

import { projects } from "../../data/data";
import { useTodoStore } from "../../store/use-todo-store";

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { todos } = useTodoStore();

  const runCommand = React.useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tasks, projects..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Tasks">
          {todos
            .filter((todo) => !todo.completed)
            .map((todo) => {
              const project = projects.find((p) => p.id === todo.projectId);
              return (
                <CommandItem
                  key={todo.id}
                  value={todo.title}
                  onSelect={() => {
                    runCommand(() => {
                      // Navigate to the task detail page
                      router.push(todoRoutes.task(todo.id));
                    });
                  }}
                >
                  <Circle className="size-4" />
                  <div className="flex flex-col">
                    <span>{todo.title}</span>
                    {project && (
                      <span className="text-muted-foreground text-xs">
                        {project.name}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
        </CommandGroup>

        <CommandGroup heading="Completed Tasks">
          {todos
            .filter((todo) => todo.completed)
            .map((todo) => {
              const project = projects.find((p) => p.id === todo.projectId);
              return (
                <CommandItem
                  key={todo.id}
                  value={todo.title}
                  onSelect={() => {
                    runCommand(() => {
                      // Navigate to the task detail page
                      router.push(todoRoutes.task(todo.id));
                    });
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  <div className="flex flex-col">
                    <span className="line-through opacity-60">
                      {todo.title}
                    </span>
                    {project && (
                      <span className="text-muted-foreground text-xs">
                        {project.name}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
        </CommandGroup>

        <CommandGroup heading="Projects">
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              value={project.name}
              onSelect={() => {
                runCommand(() => {
                  router.push(todoRoutes.project(project.id));
                });
              }}
            >
              <Hash className="size-4" />
              <span>{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Navigation">
          <CommandItem
            value="all tasks"
            onSelect={() => {
              runCommand(() => {
                router.push(todoRoutes.all);
              });
            }}
          >
            <Inbox className="size-4" />
            <span>All Tasks</span>
          </CommandItem>
          <CommandItem
            value="today"
            onSelect={() => {
              runCommand(() => {
                router.push(todoRoutes.today);
              });
            }}
          >
            <Calendar className="size-4" />
            <span>Today</span>
          </CommandItem>
          <CommandItem
            value="upcoming"
            onSelect={() => {
              runCommand(() => {
                router.push(todoRoutes.upcoming);
              });
            }}
          >
            <FolderKanban className="size-4" />
            <span>Upcoming</span>
          </CommandItem>
          <CommandItem
            value="important"
            onSelect={() => {
              runCommand(() => {
                router.push(todoRoutes.important);
              });
            }}
          >
            <Sparkles className="size-4" />
            <span>Important</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
