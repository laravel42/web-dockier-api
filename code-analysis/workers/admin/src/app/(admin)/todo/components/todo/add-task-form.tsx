"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  ChevronDown,
  ExternalLink,
  Flag,
  Plus,
  SendHorizonal,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { todoRoutes } from "@/lib/todo-routes";

import { Project } from "../../data/data";
import type { Priority } from "../../lib/config/priorities";
import { getPriorityLabel, PRIORITIES } from "../../lib/config/priorities";
import { formatDate } from "../../lib/date-utils";
import type { AddTaskCallback } from "../../lib/types/callbacks";
import { DateTimePicker } from "../date/date-time-picker";
import { ResponsivePopover } from "../ui/responsive-popover";
import { PriorityFlag } from "./priority-flag";
import { ReminderManager } from "./reminder-manager";

interface AddTaskFormProps {
  projects: Project[];
  selectedProjectId: string;
  onAddTask: AddTaskCallback;
  onProjectChange?: (projectId: string) => void;
  onCancel?: () => void;
  defaultDate?: Date;
  initiallyExpanded?: boolean;
}

interface FormData {
  title: string;
  description: string;
  date: Date | undefined;
  priority: string | null;
  reminders: Date[];
}

export function AddTaskForm({
  projects,
  selectedProjectId,
  onAddTask,
  onProjectChange,
  onCancel,
  defaultDate,
  initiallyExpanded = false,
}: AddTaskFormProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const id = useId();

  // Group form data into a single state object
  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    date: defaultDate,
    priority: null,
    reminders: [],
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const createTaskHref = (() => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("project", selectedProjectId);
    if (formData.date) params.set("due", formData.date.toISOString());
    const query = params.toString();
    return query ? `${todoRoutes.createTask}?${query}` : todoRoutes.createTask;
  })();

  // Helper to get reset form data
  const getResetFormData = (): FormData => ({
    title: "",
    description: "",
    date: defaultDate,
    priority: null,
    reminders: [],
  });

  // Helper to update form data
  const updateFormData = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleAddTask = () => {
    if (!formData.title.trim()) return;
    onAddTask(
      formData.title,
      formData.description,
      formData.date,
      formData.priority as Priority | undefined,
      formData.reminders,
    );
    // Reset form data and collapse
    setFormData(getResetFormData());
    setIsExpanded(false);
  };

  const handleCancel = () => {
    // Reset form data and collapse
    setFormData(getResetFormData());
    setIsExpanded(false);
    onCancel?.();
  };

  const addReminder = (date: Date) => {
    updateFormData({ reminders: [...formData.reminders, date] });
  };

  const clearAllReminders = () => {
    updateFormData({ reminders: [] });
    toast.success("All reminders cleared");
  };

  // Collapsed state: Show "Add New Task" button
  if (!isExpanded) {
    return (
      <motion.div
        transition={{ duration: 0 }}
        layoutId={`add-task-button-${id}`}
      >
        <Button
          variant="ghost"
          size="lg"
          className="w-full justify-start gap-2"
          onClick={() => setIsExpanded(true)}
        >
          <Plus className="h-4 w-4" />
          Add New Task
        </Button>
      </motion.div>
    );
  }

  // Expanded state: Show form
  return (
    <motion.div
      transition={{ duration: 0.3, ease: "easeOut" }}
      layoutId={`add-task-button-${id}`}
    >
      <InputGroup>
        <InputGroupInput
          autoFocus
          placeholder="Task title"
          value={formData.title}
          onChange={(e) => updateFormData({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && formData.title.trim()) {
              e.preventDefault();
              handleAddTask();
            }
          }}
          className="py-3 text-base font-medium"
        />
        {/* <InputGroupTextarea
          placeholder="Description"
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value })}
          className="min-h-[80px]"
        /> */}
        <InputGroupAddon align="block-end" className="flex-wrap border-t">
          <ResponsivePopover
            trigger={
              <InputGroupButton
                size="sm"
                className={formData.date ? "text-chart-1" : ""}
              >
                <Calendar className="h-4 w-4" />
                {formData.date ? (
                  <span className="text-xs">{formatDate(formData.date)}</span>
                ) : (
                  "Date"
                )}
              </InputGroupButton>
            }
            title="Select Date & Time"
            open={datePickerOpen}
            onOpenChange={setDatePickerOpen}
            popoverAlign="start"
            contentClassName="w-auto p-0"
          >
            <DateTimePicker
              value={formData.date}
              onChange={(date) => {
                updateFormData({ date });
                if (date) {
                  toast.success("Due date set", {
                    description: date.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  });
                }
              }}
              minDate={new Date()}
            />
          </ResponsivePopover>

          <Popover>
            <PopoverTrigger asChild>
              <InputGroupButton
                size="sm"
                className={
                  formData.priority
                    ? PRIORITIES.find((p) => p.value === formData.priority)
                        ?.color
                    : ""
                }
              >
                {formData.priority ? (
                  <PriorityFlag
                    priority={formData.priority as Priority}
                    className="h-4 w-4"
                  />
                ) : (
                  <Flag className="h-4 w-4" />
                )}
                {formData.priority || "Priority"}
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {PRIORITIES.map((priority) => (
                  <Button
                    key={priority.value}
                    variant={
                      formData.priority === priority.value
                        ? "secondary"
                        : "ghost"
                    }
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      updateFormData({ priority: priority.value });
                      toast.success("Priority updated", {
                        description: getPriorityLabel(priority.value),
                      });
                    }}
                  >
                    <PriorityFlag
                      priority={priority.value}
                      className="h-3.5 w-3.5"
                    />
                    {getPriorityLabel(priority.value)}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <ReminderManager
            reminders={formData.reminders}
            dueDate={formData.date}
            onAddReminder={addReminder}
            onClearAllReminders={clearAllReminders}
            variant="button"
            size="sm"
          />
        </InputGroupAddon>
        <InputGroupAddon align="block-end" className="border-t">
          <Popover>
            <PopoverTrigger asChild>
              <InputGroupButton size="sm" className="gap-2">
                {selectedProject ? selectedProject.name : "Select Project"}
                <ChevronDown className="h-3.5 w-3.5" />
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {projects.map((project) => (
                  <Button
                    key={project.id}
                    variant={
                      selectedProjectId === project.id ? "secondary" : "ghost"
                    }
                    className="w-full justify-start"
                    onClick={() => {
                      onProjectChange?.(project.id);
                    }}
                  >
                    {project.name}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <InputGroupButton
            size="sm"
            onClick={handleCancel}
            variant="secondary"
            className="ms-auto"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Cancel</span>
          </InputGroupButton>
          <InputGroupButton
            size="sm"
            onClick={handleAddTask}
            disabled={!formData.title.trim()}
            variant="default"
          >
            <SendHorizonal className="h-4 w-4" />
            <span className="hidden sm:inline">Add task</span>
          </InputGroupButton>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton size="sm" variant="ghost" asChild>
                  <Link href={createTaskHref}>
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">Open full page</span>
                  </Link>
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>Open in full page</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </InputGroupAddon>
      </InputGroup>
    </motion.div>
  );
}
