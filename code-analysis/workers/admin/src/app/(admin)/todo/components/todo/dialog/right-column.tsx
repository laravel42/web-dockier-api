"use client";

import {
  Calendar,
  Clock,
  Flag,
  Hash,
  MapPin,
  Plus,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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

import { Project, Todo } from "../../../data/data";
import type { Priority } from "../../../lib/config/priorities";
import { useTodoStore } from "../../../store/use-todo-store";
import { DateTimePicker } from "../../date/date-time-picker";
import { ResponsivePopover } from "../../ui/responsive-popover";
import { PriorityFlag } from "../priority-flag";
import { ReminderManager } from "../reminder-manager";

interface TodoDialogRightColumnProps {
  localTodo: Todo;
  project: Project | undefined;
  onUpdate: (todo: Todo) => void;
  setLocalTodo: (todo: Todo) => void;
}

const priorities = [
  { value: "P1", label: "P1 - Urgent", color: "text-priority-1" },
  { value: "P2", label: "P2 - High", color: "text-priority-2" },
  { value: "P3", label: "P3 - Medium", color: "text-priority-3" },
  { value: "P4", label: "P4 - Low", color: "text-priority-4" },
];

export function TodoDialogRightColumn({
  localTodo,
  project,
  onUpdate,
  setLocalTodo,
}: TodoDialogRightColumnProps) {
  const { labels, addLabel } = useTodoStore();
  const [reminders, setReminders] = useState<Date[]>(localTodo.reminders || []);
  const [labelSearch, setLabelSearch] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Sync reminders when localTodo changes
  useEffect(() => {
    setReminders(localTodo.reminders || []);
  }, [localTodo.id, localTodo.reminders]);

  const filteredLabels = labels.filter((label) =>
    label.name.toLowerCase().includes(labelSearch.toLowerCase()),
  );

  const exactLabelExists = labels.some(
    (label) => label.name.toLowerCase() === labelSearch.toLowerCase(),
  );

  const addReminder = (date: Date) => {
    const updatedReminders = [...reminders, date];
    setReminders(updatedReminders);
    const updated = { ...localTodo, reminders: updatedReminders };
    setLocalTodo(updated);
    onUpdate(updated);
  };

  const clearAllReminders = () => {
    setReminders([]);
    const updated = { ...localTodo, reminders: [] };
    setLocalTodo(updated);
    onUpdate(updated);
    toast.success("All reminders cleared");
  };

  const handleToggleLabel = (labelId: string) => {
    const currentLabels = localTodo.labels || [];
    const updated = {
      ...localTodo,
      labels: currentLabels.includes(labelId)
        ? currentLabels.filter((id) => id !== labelId)
        : [...currentLabels, labelId],
    };
    setLocalTodo(updated);
    onUpdate(updated);
  };

  const handleCreateLabel = () => {
    if (!labelSearch.trim()) return;
    const newLabel = addLabel(labelSearch.trim());
    const updated = {
      ...localTodo,
      labels: [...(localTodo.labels || []), newLabel.id],
    };
    setLocalTodo(updated);
    onUpdate(updated);
    setLabelSearch("");
    toast.success("Label created", {
      description: `"${newLabel.name}" has been added`,
    });
  };

  return (
    <div className="bg-muted/70 h-full space-y-6 divide-y p-4 md:col-span-3 md:p-6">
      {/* Project */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Project</Label>
        </div>
        <div className="bg-muted/30 rounded-md py-1.5">
          <div className="flex items-center gap-1">
            <Hash className="text-muted-foreground size-3" />
            <span className="text-xs">{project?.name}</span>
          </div>
        </div>
      </div>

      {/* Date */}
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
              value={localTodo.dueDate}
              onChange={(date) => {
                const updated = { ...localTodo, dueDate: date };
                setLocalTodo(updated);
                onUpdate(updated);
              }}
              minDate={new Date()}
            />
          </ResponsivePopover>
        </div>
        {localTodo.dueDate && (
          <div className="rounded-md py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Calendar className="text-chart-1 size-3.5" />
              <span className="">
                {localTodo.dueDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {(localTodo.dueDate.getHours() !== 0 ||
                localTodo.dueDate.getMinutes() !== 0) && (
                <div className="flex items-center gap-1">
                  <Clock className="text-muted-foreground size-3" />
                  <span className="">
                    {localTodo.dueDate.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Deadline */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Deadline</Label>
        </div>
      </div>

      {/* Priority */}
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
                  variant={!localTodo.priority ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    const updated = {
                      ...localTodo,
                      priority: undefined,
                    };
                    setLocalTodo(updated);
                    onUpdate(updated);
                  }}
                >
                  <Flag className="size-3.5" />
                  None
                </Button>
                {priorities.map((priority) => (
                  <Button
                    key={priority.value}
                    variant={
                      localTodo.priority === priority.value
                        ? "secondary"
                        : "ghost"
                    }
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      const updated = {
                        ...localTodo,
                        priority: priority.value as Priority,
                      };
                      setLocalTodo(updated);
                      onUpdate(updated);
                    }}
                  >
                    <PriorityFlag
                      priority={priority.value as Priority}
                      className="size-3.5"
                    />
                    {priority.label}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {localTodo.priority && (
          <div className="rounded-md py-1.5">
            <div className="flex items-center gap-2">
              <PriorityFlag
                priority={localTodo.priority}
                className="size-3.5"
              />
              <span className="text-xs">{localTodo.priority}</span>
            </div>
          </div>
        )}
      </div>

      {/* Labels */}
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
                            checked={localTodo.labels?.includes(label.id)}
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
        {localTodo.labels && localTodo.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {localTodo.labels.map((labelId) => {
              const label = labels.find((l) => l.id === labelId);
              if (!label) return null;
              return (
                <Badge key={label.id} className="gap-1 rounded-sm">
                  {label.name}
                  <button
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

      {/* Reminders */}
      <ReminderManager
        reminders={reminders}
        dueDate={localTodo.dueDate}
        onAddReminder={addReminder}
        onClearAllReminders={clearAllReminders}
        variant="labeled"
        size="sm"
      />

      {/* Location */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Location</Label>
        </div>
        {localTodo.location && (
          <div className="bg-muted/30 rounded-md py-1.5">
            <div className="flex items-center gap-2">
              <MapPin className="text-muted-foreground size-3.5" />
              <span className="text-xs">{localTodo.location}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
