import { Bell, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { InputGroupButton } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

import { formatDate, formatTime } from "../../lib/date-utils";
import { DateTimePicker } from "../date/date-time-picker";
import { ResponsivePopover } from "../ui/responsive-popover";

interface ReminderManagerProps {
  reminders: Date[];
  dueDate?: Date;
  onAddReminder: (date: Date) => void;
  onClearAllReminders: () => void;
  variant?: "button" | "labeled";
  size?: "sm" | "default";
}

/**
 * Reusable reminder management component
 * Handles validation, add/remove logic, and consistent UI
 * - button variant: Used in AddTaskForm with button trigger
 * - labeled variant: Used in TodoDialog right-column with label + icon trigger
 */
export function ReminderManager({
  reminders,
  dueDate,
  onAddReminder,
  onClearAllReminders,
  variant = "button",
  size = "default",
}: ReminderManagerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAddReminder = (date: Date) => {
    // Validate that reminder is before the due date
    if (dueDate && date >= dueDate) {
      toast.error("Reminder must be before the due date", {
        description: "Please select a time earlier than your due date",
      });
      return;
    }
    onAddReminder(date);
    toast.success("Reminder added", {
      description: `You'll be reminded on ${date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`,
    });
  };

  if (variant === "labeled") {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Reminders</Label>
          <ResponsivePopover
            trigger={
              <Button variant="ghost" size="icon-sm" className="size-4 p-0">
                <Plus className="text-muted-foreground size-4" />
              </Button>
            }
            title="Add Reminder"
            open={isOpen}
            onOpenChange={setIsOpen}
            contentClassName="max-w-lg overflow-hidden p-0 md:w-auto"
          >
            <ReminderContent
              reminders={reminders}
              dueDate={dueDate}
              onAddReminder={handleAddReminder}
              onClearAllReminders={onClearAllReminders}
              size="sm"
            />
          </ResponsivePopover>
        </div>
        {reminders.length > 0 && (
          <ScrollArea className="w-full">
            <div className="flex gap-1 pb-1">
              {reminders.map((reminder, index) => (
                <div
                  key={index}
                  className="bg-muted/30 flex shrink-0 items-center gap-2 rounded-md px-2 py-1"
                >
                  <Bell className="text-chart-2 size-3" />
                  <div className="text-xs whitespace-nowrap">
                    <span className="font-medium">
                      {formatDate(reminder, { style: "short" })}
                    </span>
                    <span className="text-muted-foreground mx-1">·</span>
                    <span className="text-muted-foreground">
                      {formatTime(reminder)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>
    );
  }

  // Button variant (for AddTaskForm) — uses InputGroupButton so it matches
  // the sibling Date and Priority triggers inside the same InputGroupAddon.
  return (
    <ResponsivePopover
      trigger={
        <InputGroupButton
          size="sm"
          className={reminders.length > 0 ? "text-chart-2" : ""}
        >
          <Bell className="h-4 w-4" />
          {reminders.length > 0 ? `${reminders.length}` : "Reminders"}
        </InputGroupButton>
      }
      title="Add Reminder"
      open={isOpen}
      onOpenChange={setIsOpen}
      contentClassName="max-w-lg overflow-hidden p-0 md:w-auto"
    >
      <ReminderContent
        reminders={reminders}
        dueDate={dueDate}
        onAddReminder={handleAddReminder}
        onClearAllReminders={onClearAllReminders}
        size={size}
      />
    </ResponsivePopover>
  );
}

interface ReminderContentProps {
  reminders: Date[];
  dueDate?: Date;
  onAddReminder: (date: Date) => void;
  onClearAllReminders: () => void;
  size?: "sm" | "default";
}

function ReminderContent({
  reminders,
  dueDate,
  onAddReminder,
  onClearAllReminders,
  size = "default",
}: ReminderContentProps) {
  return (
    <div className="flex flex-col">
      <div className="border-b px-3 pt-3">
        <div className="flex items-center justify-between">
          <h4
            className={
              size === "sm" ? "text-xs font-semibold" : "text-sm font-semibold"
            }
          >
            {reminders.length > 0 ? "SCHEDULED REMINDERS" : "Add Reminder"}
          </h4>
          {reminders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAllReminders}
              className="text-muted-foreground hover:text-foreground h-auto p-0 text-xs font-normal"
            >
              Clear All
            </Button>
          )}
        </div>
        {reminders.length === 0 && (
          <p className="text-muted-foreground my-1 text-xs">
            {dueDate
              ? "Select a time before your due date"
              : "Set a due date first"}
          </p>
        )}
        {reminders.length > 0 && (
          <div className="mt-1">
            <ScrollArea className="">
              <div className="flex gap-1 pb-1">
                {reminders.map((reminder, index) => (
                  <div
                    key={index}
                    className="bg-muted/30 flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <Bell className="text-chart-2 size-3 shrink-0" />
                    <div className="text-xs whitespace-nowrap">
                      <span className="font-medium">
                        {formatDate(reminder, { style: "short" })}
                      </span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span className="text-muted-foreground">
                        {formatTime(reminder)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        )}
      </div>
      {!dueDate ? (
        <div className="text-muted-foreground p-4 text-center text-sm">
          Please set a due date before adding reminders
        </div>
      ) : (
        <DateTimePicker
          value={undefined}
          onChange={(date) => {
            if (date) {
              onAddReminder(date);
            }
          }}
          minDate={new Date()}
          maxDate={dueDate}
          className="rounded-none border-0 shadow-none"
        />
      )}
    </div>
  );
}
