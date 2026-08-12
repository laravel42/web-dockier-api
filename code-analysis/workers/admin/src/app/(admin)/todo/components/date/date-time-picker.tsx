"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { Calendar } from "../ui/calendar";

interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

export function DateTimePicker({
  value,
  onChange,
  minDate,
  maxDate,
  className,
}: DateTimePickerProps) {
  const timeSlots = useMemo(() => {
    return Array.from({ length: 96 }, (_, i) => {
      const totalMinutes = i * 15;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    });
  }, []);

  const getNextTimeSlot = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Round up to next 15-minute slot
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const nextSlotMinutes = Math.ceil(currentTotalMinutes / 15) * 15;

    // Ensure we don't go past 23:45
    const nextMinutes = Math.min(nextSlotMinutes, 23 * 60 + 45);
    const nextHour = Math.floor(nextMinutes / 60);
    const nextMinute = nextMinutes % 60;

    return `${nextHour.toString().padStart(2, "0")}:${nextMinute.toString().padStart(2, "0")}`;
  };

  const [date, setDate] = useState<Date | undefined>(value);
  const [selectedTime, setSelectedTime] = useState<string | null>(
    value
      ? `${value.getHours().toString().padStart(2, "0")}:${value.getMinutes().toString().padStart(2, "0")}`
      : null,
  );

  const timeContainerRef = useRef<HTMLDivElement>(null);
  const selectedTimeRef = useRef<HTMLButtonElement>(null);

  // Scroll to selected time slot when it changes
  useEffect(() => {
    if (selectedTimeRef.current && timeContainerRef.current) {
      const container = timeContainerRef.current;
      const selectedElement = selectedTimeRef.current;

      // Calculate the position to scroll to (center the selected element)
      const containerHeight = container.clientHeight;
      const elementTop = selectedElement.offsetTop;
      const elementHeight = selectedElement.clientHeight;
      const scrollPosition =
        elementTop - containerHeight / 2 + elementHeight / 2;

      // Scroll smoothly to the selected time
      container.scrollTo({
        top: scrollPosition,
        behavior: "smooth",
      });
    }
  }, [selectedTime]);

  // Validate selected time when date changes
  useEffect(() => {
    if (date && selectedTime) {
      const disabled = isTimeDisabled(selectedTime);
      if (disabled) {
        // If current time is disabled, select next available time
        const now = new Date();
        const isToday =
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate();

        if (isToday) {
          const nextTime = getNextTimeSlot();
          setSelectedTime(nextTime);
          const [hours, minutes] = nextTime.split(":").map(Number);
          const newDate = new Date(date);
          newDate.setHours(hours, minutes, 0, 0);
          onChange(newDate);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const presets = [
    { label: "Today", value: 0 },
    { label: "Tomorrow", value: 1 },
    { label: "In 3 days", value: 3 },
    { label: "In a week", value: 7 },
  ];

  const handleDateSelect = (newDate: Date | undefined) => {
    setDate(newDate);

    if (newDate) {
      // Check if currently selected time would be disabled for the new date
      let timeToUse = selectedTime || getNextTimeSlot();
      const [hours, minutes] = timeToUse.split(":").map(Number);
      const slotTotalMinutes = hours * 60 + minutes;
      let shouldUpdateTime = !selectedTime; // Track if we need to update time

      // Check if this time would be disabled
      const now = new Date();
      const isToday =
        newDate.getFullYear() === now.getFullYear() &&
        newDate.getMonth() === now.getMonth() &&
        newDate.getDate() === now.getDate();

      // If it's today and the time is in the past, use next available slot
      if (isToday) {
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
        if (slotTotalMinutes <= currentTotalMinutes) {
          timeToUse = getNextTimeSlot();
          shouldUpdateTime = true;
        }
      }

      // If it's the same as maxDate and time is after maxDate's time, use maxDate's time
      if (maxDate) {
        const isSameAsMaxDate =
          newDate.getFullYear() === maxDate.getFullYear() &&
          newDate.getMonth() === maxDate.getMonth() &&
          newDate.getDate() === maxDate.getDate();

        if (isSameAsMaxDate) {
          const maxTotalMinutes =
            maxDate.getHours() * 60 + maxDate.getMinutes();
          if (slotTotalMinutes > maxTotalMinutes) {
            // Find the closest time slot before or equal to maxDate's time
            const maxHours = maxDate.getHours();
            const maxMinutes = Math.floor(maxDate.getMinutes() / 15) * 15;
            timeToUse = `${maxHours.toString().padStart(2, "0")}:${maxMinutes.toString().padStart(2, "0")}`;
            shouldUpdateTime = true;
          }
        }
      }

      // Update selected time if needed
      if (shouldUpdateTime) {
        setSelectedTime(timeToUse);
      }

      const [finalHours, finalMinutes] = timeToUse.split(":").map(Number);
      newDate.setHours(finalHours, finalMinutes, 0, 0);
      onChange(newDate);
    }
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    if (date) {
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);
      onChange(newDate);
    }
  };

  const handlePresetClick = (daysToAdd: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + daysToAdd);

    // If it's today, use the next available time slot
    if (daysToAdd === 0) {
      const nextTime = getNextTimeSlot();
      const [hours, minutes] = nextTime.split(":").map(Number);
      newDate.setHours(hours, minutes, 0, 0);
      setSelectedTime(nextTime);
    } else {
      // For future dates, start at midnight
      newDate.setHours(0, 0, 0, 0);
      setSelectedTime("00:00");
    }

    setDate(newDate);
    onChange(newDate);
  };

  const handleClear = () => {
    setDate(undefined);
    setSelectedTime(null);
    onChange(undefined);
  };

  const disabledDates = (date: Date) => {
    if (minDate) {
      const minDateOnly = new Date(
        minDate.getFullYear(),
        minDate.getMonth(),
        minDate.getDate(),
      );
      const currentDateOnly = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      if (currentDateOnly < minDateOnly) return true;
    }
    if (maxDate) {
      const maxDateOnly = new Date(
        maxDate.getFullYear(),
        maxDate.getMonth(),
        maxDate.getDate(),
      );
      const currentDateOnly = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      if (currentDateOnly > maxDateOnly) return true;
    }
    return false;
  };

  const isTimeDisabled = (time: string) => {
    if (!date) return false;

    const [hours, minutes] = time.split(":").map(Number);
    const now = new Date();

    // Check if selected date is today
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    // If it's today, disable times that have already passed
    if (isToday) {
      const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
      const slotTotalMinutes = hours * 60 + minutes;
      if (slotTotalMinutes <= currentTotalMinutes) return true;
    }

    // Check if selected date is the same as maxDate
    if (maxDate) {
      const isSameAsMaxDate =
        date.getFullYear() === maxDate.getFullYear() &&
        date.getMonth() === maxDate.getMonth() &&
        date.getDate() === maxDate.getDate();

      // If it's the same as maxDate, disable times after maxDate's time
      if (isSameAsMaxDate) {
        const maxTotalMinutes = maxDate.getHours() * 60 + maxDate.getMinutes();
        const slotTotalMinutes = hours * 60 + minutes;
        if (slotTotalMinutes > maxTotalMinutes) return true;
      }
    }

    return false;
  };

  return (
    <Card className={cn("w-auto gap-0 border-none p-0 shadow-none", className)}>
      <CardContent className="flex flex-col p-0 sm:flex-row">
        {/* Calendar section */}
        <div className="flex flex-1 flex-col items-center gap-4 p-6">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            defaultMonth={date}
            showOutsideDays={false}
            disabled={disabledDates}
            className="bg-transparent p-0"
          />
          {date && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-destructive gap-2"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
        {/* Time slots section */}
        <div
          ref={timeContainerRef}
          className="max-h-72 overflow-x-auto border-t p-4 sm:max-h-96 sm:w-48 sm:shrink-0 sm:overflow-x-hidden sm:overflow-y-scroll sm:border-t-0 sm:border-l"
          onWheel={(e) => {
            // Allow mouse wheel scrolling
            e.stopPropagation();
          }}
        >
          <div className="flex flex-nowrap gap-1.5 sm:grid">
            {timeSlots.map((time) => {
              const disabled = isTimeDisabled(time);
              return (
                <Button
                  key={time}
                  ref={selectedTime === time ? selectedTimeRef : null}
                  variant={selectedTime === time ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTimeSelect(time)}
                  disabled={disabled}
                  className="min-w-20 shrink-0 shadow-none sm:w-full sm:min-w-0"
                >
                  {time}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 border-t p-4 sm:flex-row">
        <div className="flex flex-1 flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.value}
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handlePresetClick(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </CardFooter>
    </Card>
  );
}
