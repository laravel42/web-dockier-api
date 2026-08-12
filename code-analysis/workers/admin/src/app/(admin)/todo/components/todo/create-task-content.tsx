"use client";

import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Clock,
  Flag,
  Hash,
  MapPin,
  Plus,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { todoRoutes } from "@/lib/todo-routes";
import { cn } from "@/lib/utils";

import { projects, type Subtask } from "../../data/data";
import type { Priority } from "../../lib/config/priorities";
import { useTodoStore } from "../../store/use-todo-store";
import { DateTimePicker } from "../date/date-time-picker";
import { ResponsivePopover } from "../ui/responsive-popover";
import { PriorityFlag } from "./priority-flag";
import { ReminderManager } from "./reminder-manager";
import { SubtaskList } from "./subtask-list";

const priorities = [
  { value: "P1", label: "P1 - Urgent" },
  { value: "P2", label: "P2 - High" },
  { value: "P3", label: "P3 - Medium" },
  { value: "P4", label: "P4 - Low" },
] as const;

interface CreateTaskDraft {
  title: string;
  description: string;
  projectId: string;
  dueDate?: Date;
  deadline?: Date;
  priority?: Priority;
  reminders: Date[];
  labels: string[];
  location: string;
  subtasks: Subtask[];
}

interface CreateTaskContentProps {
  defaultProjectId?: string;
  defaultDueDate?: Date;
}

export function CreateTaskContent({
  defaultProjectId,
  defaultDueDate,
}: CreateTaskContentProps) {
  const router = useRouter();
  const { addTodo, labels, addLabel } = useTodoStore();

  const getEmptyDraft = (): CreateTaskDraft => ({
    title: "",
    description: "",
    projectId: defaultProjectId || projects[0]?.id || "",
    dueDate: defaultDueDate,
    reminders: [],
    labels: [],
    location: "",
    subtasks: [],
  });

  const [draft, setDraft] = useState<CreateTaskDraft>(getEmptyDraft);
  const [labelSearch, setLabelSearch] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [deadlinePickerOpen, setDeadlinePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProject = projects.find((p) => p.id === draft.projectId);

  const filteredLabels = labels.filter((label) =>
    label.name.toLowerCase().includes(labelSearch.toLowerCase()),
  );

  const exactLabelExists = labels.some(
    (label) => label.name.toLowerCase() === labelSearch.toLowerCase(),
  );

  const updateDraft = (updates: Partial<CreateTaskDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  const handleAddSubtask = (title: string) => {
    updateDraft({
      subtasks: [
        ...draft.subtasks,
        { id: `st-${Date.now()}`, title, completed: false },
      ],
    });
  };

  const handleToggleSubtask = (subtaskId: string) => {
    updateDraft({
      subtasks: draft.subtasks.map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, completed: !subtask.completed }
          : subtask,
      ),
    });
  };

  const handleRemoveSubtask = (subtaskId: string) => {
    updateDraft({
      subtasks: draft.subtasks.filter((subtask) => subtask.id !== subtaskId),
    });
  };

  const handleToggleLabel = (labelId: string) => {
    updateDraft({
      labels: draft.labels.includes(labelId)
        ? draft.labels.filter((id) => id !== labelId)
        : [...draft.labels, labelId],
    });
  };

  const handleCreateLabel = () => {
    if (!labelSearch.trim()) return;
    const newLabel = addLabel(labelSearch.trim());
    updateDraft({ labels: [...draft.labels, newLabel.id] });
    setLabelSearch("");
    toast.success("Label created", {
      description: `"${newLabel.name}" has been added`,
    });
  };

  const handleCreate = () => {
    if (!draft.title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const newTodo = addTodo({
      title: draft.title.trim(),
      description: draft.description.trim(),
      projectId: draft.projectId,
      dueDate: draft.dueDate,
      deadline: draft.deadline,
      priority: draft.priority,
      reminders: draft.reminders.length > 0 ? draft.reminders : undefined,
      subtasks: draft.subtasks,
      labels: draft.labels.length > 0 ? draft.labels : undefined,
      location: draft.location.trim() || undefined,
    });

    toast.success("Task created", {
      description: `"${newTodo.title}" has been added`,
    });
    router.replace(todoRoutes.all);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={todoRoutes.all}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Hash className="text-muted-foreground size-4" />
            <span className="text-sm font-medium">
              {selectedProject?.name ?? "Select project"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={todoRoutes.all}>Cancel</Link>
          </Button>
          <Button onClick={handleCreate} disabled={!draft.title.trim()}>
            Create task
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-8">
        <div className="md:col-span-5">
          <div className="flex flex-col p-4 md:p-6">
            <Input
              autoFocus
              value={draft.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.title.trim()) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              className="mb-4 border-none px-0 text-xl! font-semibold shadow-none focus-visible:ring-0"
              placeholder="Task title"
              aria-label="Task title"
            />

            <Textarea
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              placeholder="Description"
              className="mb-4 min-h-32 resize-none border-0 text-sm shadow-none focus-visible:ring-0"
            />

            <div className="border-t pt-4">
              <div className="mb-3 flex items-center gap-2">
                <ChevronDown className="text-muted-foreground size-4" />
                <h3 className="text-sm font-medium">Subtasks</h3>
                {draft.subtasks.length > 0 && (
                  <span className="bg-muted ml-auto inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {draft.subtasks.length}
                  </span>
                )}
              </div>
              <SubtaskList
                subtasks={draft.subtasks}
                onToggleSubtask={handleToggleSubtask}
                variant="full"
                onRemoveSubtask={handleRemoveSubtask}
                onAddSubtask={handleAddSubtask}
              />
            </div>
          </div>
        </div>

        <div className="bg-muted/70 space-y-6 divide-y p-4 md:col-span-3 md:p-6">
          <div>
            <Label className="mb-1.5 block">Project</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between gap-2"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash className="text-muted-foreground size-3.5 shrink-0" />
                    {selectedProject?.name ?? "Select project"}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  {projects.map((project) => (
                    <Button
                      key={project.id}
                      variant={
                        draft.projectId === project.id ? "secondary" : "ghost"
                      }
                      className="w-full justify-start"
                      onClick={() => updateDraft({ projectId: project.id })}
                    >
                      {project.name}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Date</Label>
              <ResponsivePopover
                trigger={
                  <Button variant="ghost" size="icon-sm" className="size-4 p-0">
                    <Plus className="text-muted-foreground size-4" />
                  </Button>
                }
                title="Select Date & Time"
                open={datePickerOpen}
                onOpenChange={setDatePickerOpen}
                contentClassName="w-auto p-0"
              >
                <DateTimePicker
                  value={draft.dueDate}
                  onChange={(date) => updateDraft({ dueDate: date })}
                  minDate={new Date()}
                />
              </ResponsivePopover>
            </div>
            {draft.dueDate && (
              <div className="flex items-center justify-between rounded-md py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="text-chart-1 size-3.5" />
                  <span>
                    {draft.dueDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {(draft.dueDate.getHours() !== 0 ||
                    draft.dueDate.getMinutes() !== 0) && (
                    <div className="flex items-center gap-1">
                      <Clock className="text-muted-foreground size-3" />
                      <span>
                        {draft.dueDate.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  onClick={() => updateDraft({ dueDate: undefined })}
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Deadline</Label>
              <ResponsivePopover
                trigger={
                  <Button variant="ghost" size="icon-sm" className="size-4 p-0">
                    <Plus className="text-muted-foreground size-4" />
                  </Button>
                }
                title="Select Deadline"
                open={deadlinePickerOpen}
                onOpenChange={setDeadlinePickerOpen}
                contentClassName="w-auto p-0"
              >
                <DateTimePicker
                  value={draft.deadline}
                  onChange={(date) => updateDraft({ deadline: date })}
                  minDate={draft.dueDate ?? new Date()}
                />
              </ResponsivePopover>
            </div>
            {draft.deadline && (
              <div className="flex items-center justify-between rounded-md py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="text-chart-1 size-3.5" />
                  <span>
                    {draft.deadline.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  onClick={() => updateDraft({ deadline: undefined })}
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Priority</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-4 p-0">
                    <Plus className="text-muted-foreground size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-1">
                    <Button
                      variant={!draft.priority ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2"
                      onClick={() => updateDraft({ priority: undefined })}
                    >
                      <Flag className="size-3.5" />
                      None
                    </Button>
                    {priorities.map((priority) => (
                      <Button
                        key={priority.value}
                        variant={
                          draft.priority === priority.value
                            ? "secondary"
                            : "ghost"
                        }
                        className="w-full justify-start gap-2"
                        onClick={() =>
                          updateDraft({ priority: priority.value })
                        }
                      >
                        <PriorityFlag
                          priority={priority.value}
                          className="size-3.5"
                        />
                        {priority.label}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {draft.priority && (
              <div className="rounded-md py-1.5">
                <div className="flex items-center gap-2">
                  <PriorityFlag
                    priority={draft.priority}
                    className="size-3.5"
                  />
                  <span className="text-xs">{draft.priority}</span>
                </div>
              </div>
            )}
          </div>

          <div className="py-1.5">
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Labels</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-4 p-0">
                    <Plus className="text-muted-foreground size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0">
                  <div className="flex flex-col overflow-hidden">
                    <div className="border-b px-3 py-2">
                      <Input
                        value={labelSearch}
                        onChange={(e) => setLabelSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && labelSearch.trim()) {
                            e.preventDefault();
                            if (filteredLabels.length === 0) {
                              handleCreateLabel();
                            }
                          }
                        }}
                        placeholder="Type a label"
                        className="h-7 border-0 px-0 focus-visible:ring-0"
                        autoFocus
                      />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {filteredLabels.length > 0 && (
                        <div className="py-1">
                          {filteredLabels.map((label) => (
                            <div
                              key={label.id}
                              onClick={() => handleToggleLabel(label.id)}
                              className="hover:bg-accent flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
                            >
                              <Tag className="text-muted-foreground size-3.5" />
                              <span className="flex-1">{label.name}</span>
                              <Checkbox
                                checked={draft.labels.includes(label.id)}
                                className="pointer-events-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {labelSearch.trim() && !exactLabelExists && (
                        <div className="border-t p-3 text-center">
                          <p className="text-muted-foreground mb-2 text-xs">
                            Label not found
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCreateLabel}
                            className="h-7 gap-1.5 text-xs"
                          >
                            <Plus className="size-3.5" />
                            Create &quot;{labelSearch}&quot;
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {draft.labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {draft.labels.map((labelId) => {
                  const label = labels.find((item) => item.id === labelId);
                  if (!label) return null;
                  return (
                    <Badge key={label.id} className="gap-1 rounded-sm">
                      {label.name}
                      <button
                        type="button"
                        onClick={() => handleToggleLabel(label.id)}
                        className="hover:bg-muted/20 rounded-sm"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <ReminderManager
            reminders={draft.reminders}
            dueDate={draft.dueDate}
            onAddReminder={(date) =>
              updateDraft({ reminders: [...draft.reminders, date] })
            }
            onClearAllReminders={() => updateDraft({ reminders: [] })}
            variant="labeled"
            size="sm"
          />

          <div>
            <Label className="mb-1.5 block">Location</Label>
            <div className="relative">
              <MapPin className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={draft.location}
                onChange={(e) => updateDraft({ location: e.target.value })}
                placeholder="Add a location"
                className={cn("pl-8", draft.location && "pr-8")}
              />
              {draft.location && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
                  onClick={() => updateDraft({ location: "" })}
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
