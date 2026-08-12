"use client";

import { Check, CheckCircle2, ChevronsUpDown, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { Fragment, Suspense, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
} from "@/components/ui/item";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { todoRoutes } from "@/lib/todo-routes";
import { cn } from "@/lib/utils";

import { projects, Todo } from "../data/data";
import { useTodoStore } from "../store/use-todo-store";

function ActivityContent() {
  const router = useRouter();
  const [projectId, setProjectId] = useQueryState("projectId");
  const { todos } = useTodoStore();
  const [isProjectSelectOpen, setIsProjectSelectOpen] = useState(false);

  const handleTodoClick = (todo: Todo) => {
    router.push(todoRoutes.task(todo.id));
  };

  // Filter completed todos
  const completedTodos = todos.filter((todo) => {
    if (!todo.completed || todo.deletedAt) return false;
    if (projectId && todo.projectId !== projectId) return false;
    return true;
  });

  const allCompletedTodos = completedTodos;

  // Group by date
  const groupedByDate = allCompletedTodos.reduce(
    (acc, todo) => {
      const date = todo.updatedAt || todo.createdAt;
      const dateKey = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(todo);
      return acc;
    },
    {} as Record<string, Todo[]>,
  );

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  return (
    <>
      {/* Header with Project Selector */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Activity:</h1>
        <Popover
          open={isProjectSelectOpen}
          onOpenChange={setIsProjectSelectOpen}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              role="combobox"
              aria-expanded={isProjectSelectOpen}
              className="gap-2 text-2xl font-bold hover:bg-transparent"
            >
              {selectedProject ? selectedProject.name : "All Projects"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Type a project name..." />
              <CommandList>
                <CommandEmpty>No project found.</CommandEmpty>
                <CommandGroup heading="Projects">
                  <CommandItem
                    value="all-projects"
                    onSelect={() => {
                      setProjectId(null);
                      setIsProjectSelectOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        !projectId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    All Projects
                  </CommandItem>
                  {projects.map((project) => (
                    <CommandItem
                      key={project.id}
                      value={project.name.toLowerCase()}
                      onSelect={() => {
                        setProjectId(project.id);
                        setIsProjectSelectOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          projectId === project.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {project.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Activity Timeline */}
      {Object.keys(groupedByDate).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([dateKey, todos]) => (
            <div key={dateKey} className="">
              <div className="text-muted-foreground bg-background sticky top-0 border-b pb-2 text-sm font-medium">
                {dateKey}
              </div>
              <ItemGroup className="space-y-2">
                {todos.map((todo, index) => {
                  const project = projects.find((p) => p.id === todo.projectId);
                  return (
                    <Fragment key={todo.id}>
                      {index > 0 && <ItemSeparator />}
                      <Item variant="outline" className="border-0 px-0">
                        <ItemMedia>
                          <Avatar className="size-10">
                            <AvatarImage
                              src="https://avatar.vercel.sh/personal"
                              alt="Profile"
                            />
                            <AvatarFallback>
                              <User className="size-4" />
                            </AvatarFallback>
                          </Avatar>
                        </ItemMedia>
                        <ItemContent>
                          <div className="flex items-end justify-between">
                            <div className="">
                              <p className="text-sm">
                                <span className="font-medium">You</span>{" "}
                                completed a task:{" "}
                                <button
                                  className="decoration-muted-foreground hover:text-foreground cursor-pointer font-medium underline underline-offset-4"
                                  onClick={() => handleTodoClick(todo)}
                                >
                                  {todo.title}
                                </button>{" "}
                                <CheckCircle2 className="text-success inline h-4 w-4" />
                              </p>
                              <p className="text-muted-foreground mt-1 text-xs">
                                {(
                                  todo.updatedAt || todo.createdAt
                                ).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            {project && (
                              <div className="text-muted-foreground text-xs">
                                {project.name}
                              </div>
                            )}
                          </div>
                        </ItemContent>
                      </Item>
                    </Fragment>
                  );
                })}
              </ItemGroup>
            </div>
          ))}
          <div className="text-muted-foreground border-t pt-4 text-center text-sm">
            That&apos;s it. No more history to load.
          </div>
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 />
            </EmptyMedia>
            <EmptyTitle>No completed tasks yet</EmptyTitle>
            <EmptyDescription>
              {selectedProject
                ? `No completed tasks in ${selectedProject.name} yet`
                : "Complete some tasks to see your activity here"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ActivityContent />
    </Suspense>
  );
}
