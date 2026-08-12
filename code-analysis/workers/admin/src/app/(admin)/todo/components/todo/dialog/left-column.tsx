"use client";

import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Subtask, Todo } from "../../../data/data";
import { SubtaskList } from "../subtask-list";
import { TodoCheckbox } from "../todo-checkbox";
import { TodoDialogComments } from "./comments";

interface TodoDialogLeftColumnProps {
  localTodo: Todo;
  onUpdate: (todo: Todo) => void;
  setLocalTodo: (todo: Todo) => void;
}

export function TodoDialogLeftColumn({
  localTodo,
  onUpdate,
  setLocalTodo,
}: TodoDialogLeftColumnProps) {
  const handleToggleComplete = () => {
    const updated = { ...localTodo, completed: !localTodo.completed };
    setLocalTodo(updated);
    onUpdate(updated);
    if (updated.completed) {
      toast.success("Task completed! 🎉", {
        description: `"${localTodo.title}" marked as complete`,
      });
    }
  };

  const handleToggleSubtask = (subtaskId: string) => {
    const updated = {
      ...localTodo,
      subtasks: localTodo.subtasks.map((st) =>
        st.id === subtaskId ? { ...st, completed: !st.completed } : st,
      ),
    };
    setLocalTodo(updated);
    onUpdate(updated);
    const subtask = updated.subtasks.find((st) => st.id === subtaskId);
    if (subtask?.completed) {
      toast.success("Subtask completed! ✓", {
        description: `"${subtask.title}" marked as complete`,
      });
    }
  };

  const handleRemoveSubtask = (subtaskId: string) => {
    const updated = {
      ...localTodo,
      subtasks: localTodo.subtasks.filter((st) => st.id !== subtaskId),
    };
    setLocalTodo(updated);
    onUpdate(updated);
  };

  const handleAddSubtask = (title: string) => {
    const newSubtask: Subtask = {
      id: `st-${Date.now()}`,
      title,
      completed: false,
    };
    const updated = {
      ...localTodo,
      subtasks: [...localTodo.subtasks, newSubtask],
    };
    setLocalTodo(updated);
    onUpdate(updated);
  };

  const handleUpdateTitle = (title: string) => {
    const updated = { ...localTodo, title };
    setLocalTodo(updated);
    onUpdate(updated);
  };

  const handleUpdateDescription = (description: string) => {
    const updated = { ...localTodo, description };
    setLocalTodo(updated);
    onUpdate(updated);
  };

  return (
    <div className="flex h-full flex-col p-4 md:max-h-[calc(100vh-120px)] md:overflow-y-auto md:p-6">
      {/* Title with Checkbox */}
      <div className="flex items-center gap-2">
        <TodoCheckbox
          completed={localTodo.completed}
          priority={localTodo.priority}
          title={localTodo.title}
          onToggle={handleToggleComplete}
          variant="success"
          className="shrink-0"
        />

        <Input
          value={localTodo.title}
          onChange={(e) => handleUpdateTitle(e.target.value)}
          className="border-none px-0 text-xl! font-semibold shadow-none focus-visible:ring-0"
          placeholder="Task title"
          aria-label="Task title"
        />
      </div>

      {/* Description */}
      <Textarea
        value={localTodo.description || ""}
        onChange={(e) => handleUpdateDescription(e.target.value)}
        placeholder="Description"
        className="mb-4 resize-none border-0 text-sm shadow-none focus-visible:ring-0"
      />

      {/* Subtasks */}
      {localTodo.subtasks.length > 0 ? (
        <Accordion
          type="single"
          collapsible
          className="w-full"
          defaultValue="subtasks"
        >
          <AccordionItem value="subtasks" className="">
            <AccordionTrigger showChevron={false} className="border-b py-2">
              <div className="flex items-center gap-2">
                <ChevronDown className="text-muted-foreground pointer-events-none size-5 shrink-0 transition-transform duration-200" />
                <h3 className="text-sm">Subtasks</h3>
              </div>
              <div className="flex items-center gap-2">
                <Plus className="text-muted-foreground size-4" />
                {localTodo.subtasks.length > 0 && (
                  <span className="bg-muted ml-auto inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {localTodo.subtasks.length}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-4">
              <SubtaskList
                subtasks={localTodo.subtasks}
                onToggleSubtask={handleToggleSubtask}
                variant="full"
                onRemoveSubtask={handleRemoveSubtask}
                onAddSubtask={handleAddSubtask}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : (
        <div className="p-4">
          <SubtaskList
            subtasks={[]}
            onToggleSubtask={handleToggleSubtask}
            variant="full"
            onRemoveSubtask={handleRemoveSubtask}
            onAddSubtask={handleAddSubtask}
          />
        </div>
      )}

      {/* Comments Section */}
      <TodoDialogComments
        localTodo={localTodo}
        onUpdate={onUpdate}
        setLocalTodo={setLocalTodo}
      />
    </div>
  );
}
