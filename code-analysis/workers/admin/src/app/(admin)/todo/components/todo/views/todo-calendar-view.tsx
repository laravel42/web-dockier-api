"use client";

import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { Project, Todo } from "../../../data/data";
import type { Priority } from "../../../lib/config/priorities";
import { formatDateLabel, normalizeDate } from "../../../lib/date-utils";
import { getProjectById } from "../../../lib/todo-utils";
import type { AddTodoWithDateCallback } from "../../../lib/types/callbacks";
import { Calendar } from "../../ui/calendar";
import { AddTaskForm } from "../add-task-form";
import { TodoItem } from "../item";

// Calendar view constants
const UPCOMING_DAYS_LIMIT = 14; // Number of days to show in upcoming tasks view

interface TodoCalendarViewProps {
  todos: Todo[];
  projects: Project[];
  onTodoClick: (todo: Todo) => void;
  onAddTask?: AddTodoWithDateCallback;
}

interface DayData {
  date: Date;
  dayName: string;
  dayNumber: number;
  monthName: string;
  isToday: boolean;
  isSelected: boolean;
  todos: Todo[];
}

export function TodoCalendarView({
  todos,
  projects,
  onTodoClick,
  onAddTask,
}: TodoCalendarViewProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    new Date(),
  );
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
  const [weekStartDate, setWeekStartDate] = React.useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    return new Date(today.setDate(diff));
  });
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>(
    projects[0]?.id || "",
  );

  // Update month display based on the selected date or middle of the week
  const currentMonth = React.useMemo(() => {
    if (selectedDate) {
      return selectedDate;
    }
    const middleOfWeek = new Date(weekStartDate);
    middleOfWeek.setDate(weekStartDate.getDate() + 3);
    return middleOfWeek;
  }, [weekStartDate, selectedDate]);

  // Get 7 days starting from weekStartDate
  const getWeekDays = (): DayData[] => {
    const days: DayData[] = [];
    const today = normalizeDate(new Date());

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStartDate);
      date.setDate(weekStartDate.getDate() + i);
      const normalizedDate = normalizeDate(date);

      const dayTodos = todos.filter((todo) => {
        if (!todo.dueDate) return false;
        const todoDate = normalizeDate(new Date(todo.dueDate));
        return todoDate.getTime() === normalizedDate.getTime();
      });

      days.push({
        date: normalizedDate,
        dayName: normalizedDate.toLocaleDateString("en-US", {
          weekday: "short",
        }),
        dayNumber: normalizedDate.getDate(),
        monthName: normalizedDate.toLocaleDateString("en-US", {
          month: "short",
        }),
        isToday: normalizedDate.getTime() === today.getTime(),
        isSelected: false,
        todos: dayTodos,
      });
    }

    return days;
  };

  // Get upcoming dates with tasks starting from selected date
  const getUpcomingDates = () => {
    const dates: Array<{
      date: Date;
      label: string;
      todos: Todo[];
    }> = [];
    const startDate = normalizeDate(
      selectedDate ? new Date(selectedDate) : new Date(),
    );
    const today = normalizeDate(new Date());

    for (let i = 0; i < UPCOMING_DAYS_LIMIT; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const normalizedDate = normalizeDate(date);

      const dayTodos = todos.filter((todo) => {
        if (!todo.dueDate) return false;
        const todoDate = normalizeDate(new Date(todo.dueDate));
        return todoDate.getTime() === normalizedDate.getTime();
      });

      const label = formatDateLabel(normalizedDate, today);
      dates.push({ date: normalizedDate, label, todos: dayTodos });
    }

    return dates;
  };

  const weekDays = React.useMemo(
    () => getWeekDays(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekStartDate, todos],
  );
  const upcomingDates = React.useMemo(
    () => getUpcomingDates(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDate, todos],
  );

  // Get all dates that have todos for calendar highlighting
  const datesWithTodos = React.useMemo(() => {
    return todos
      .filter((todo) => todo.dueDate)
      .map((todo) => new Date(todo.dueDate!));
  }, [todos]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setIsCalendarOpen(false);

      // Update week to show the selected date
      const day = date.getDay();
      const diff = date.getDate() - day;
      const newWeekStart = new Date(date);
      newWeekStart.setDate(diff);
      setWeekStartDate(newWeekStart);
    }
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(weekStartDate);
    newDate.setDate(weekStartDate.getDate() - 7);
    setWeekStartDate(newDate);
    // Select Wednesday of the new week (middle day)
    const selectedDay = new Date(newDate);
    selectedDay.setDate(newDate.getDate() + 3);
    setSelectedDate(selectedDay);
  };

  const goToNextWeek = () => {
    const newDate = new Date(weekStartDate);
    newDate.setDate(weekStartDate.getDate() + 7);
    setWeekStartDate(newDate);
    // Select Wednesday of the new week (middle day)
    const selectedDay = new Date(newDate);
    selectedDay.setDate(newDate.getDate() + 3);
    setSelectedDate(selectedDay);
  };

  const goToToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    setWeekStartDate(new Date(today.setDate(diff)));
    setSelectedDate(new Date());
  };

  const handleAddTask =
    (defaultDate: Date) =>
    (
      title: string,
      description: string,
      dueDate?: Date,
      priority?: Priority,
      reminders?: Date[],
    ) => {
      if (onAddTask) {
        // Use the date from the form if provided (with time), otherwise use the default calendar date
        const finalDate = dueDate || defaultDate;
        onAddTask(
          title,
          description,
          finalDate,
          priority,
          reminders,
          selectedProjectId,
        );
      }
    };

  return (
    <div className="space-y-4">
      {/* Month selector and navigation */}
      <div className="flex items-center justify-between">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="hover:bg-accent text-lg font-semibold"
            >
              {currentMonth.toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              <CalendarIcon className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              modifiers={{
                hasTodos: datesWithTodos,
              }}
              modifiersClassNames={{
                hasTodos: "font-bold underline decoration-primary",
              }}
            />
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Week slider */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousWeek}
          className="h-8 w-8 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="grid flex-1 grid-cols-7 gap-2">
          {weekDays.map((day, index) => {
            const isSelected =
              selectedDate &&
              day.date.getDate() === selectedDate.getDate() &&
              day.date.getMonth() === selectedDate.getMonth() &&
              day.date.getFullYear() === selectedDate.getFullYear();

            return (
              <button
                key={index}
                onClick={() => handleDateSelect(day.date)}
                className={cn(
                  "hover:bg-accent flex shrink-0 flex-col items-center rounded-lg p-2 text-center transition-colors",
                  day.isToday &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                  isSelected &&
                    !day.isToday &&
                    "ring-primary ring-2 ring-offset-2",
                )}
              >
                <span className="text-xs font-medium">{day.dayName}</span>
                <span
                  className={cn(
                    "text-2xl font-semibold",
                    day.isToday && "text-primary-foreground",
                  )}
                >
                  {day.dayNumber}
                </span>
                {day.todos.length > 0 && !day.isToday && (
                  <div className="mt-1 flex gap-0.5">
                    {day.todos.slice(0, 3).map((_, i) => (
                      <div
                        key={i}
                        className="bg-primary h-1 w-1 rounded-full"
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextWeek}
          className="h-8 w-8 shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Upcoming tasks grouped by date */}
      <div className="space-y-6">
        {upcomingDates.map((dateData) => (
          <div key={dateData.date.toISOString()} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-muted-foreground text-sm font-medium">
                {dateData.label}
              </h3>
              <Separator className="flex-1" />
            </div>

            <div className="space-y-0">
              {dateData.todos.map((todo) => {
                const project = getProjectById(projects, todo.projectId);
                return (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    project={project}
                    onClick={onTodoClick}
                  />
                );
              })}
              <AddTaskForm
                projects={projects}
                selectedProjectId={selectedProjectId}
                onAddTask={handleAddTask(dateData.date)}
                onProjectChange={setSelectedProjectId}
                defaultDate={dateData.date}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
