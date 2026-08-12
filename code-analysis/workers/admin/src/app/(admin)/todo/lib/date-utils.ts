/**
 * Centralized date and time formatting utilities
 * Used across the application for consistent date/time display
 */

/**
 * Format a date with consistent options
 */
export function formatDate(
  date: Date | undefined,
  options?: {
    includeYear?: boolean;
    style?: "short" | "long";
  },
): string {
  if (!date) return "";

  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: options?.style === "long" ? "long" : "short",
    day: "numeric",
    ...(options?.includeYear && { year: "numeric" }),
  };

  return date.toLocaleDateString("en-US", defaultOptions);
}

/**
 * Format time portion of a date
 */
export function formatTime(date: Date | undefined): string {
  if (!date) return "";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Check if a date has a time component (not midnight)
 */
export function hasTime(date: Date | undefined): boolean {
  if (!date) return false;
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

/**
 * Get a date based on a preset (today, tomorrow, next week, etc.)
 */
export function getPresetDate(
  preset: "today" | "tomorrow" | "next-week" | "next-month" | "no-date",
): Date | undefined {
  if (preset === "no-date") return undefined;

  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return date;
    case "tomorrow":
      date.setDate(date.getDate() + 1);
      return date;
    case "next-week":
      date.setDate(date.getDate() + 7);
      return date;
    case "next-month":
      date.setMonth(date.getMonth() + 1);
      return date;
    default:
      return undefined;
  }
}

/**
 * Normalize a date by setting hours, minutes, seconds, and milliseconds to 0
 * Useful for comparing dates without time components
 */
export function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Format a date with contextual labels (Today, Tomorrow, or weekday)
 * Used in calendar views to show relative date information
 */
export function formatDateLabel(date: Date, today: Date): string {
  const normalizedDate = normalizeDate(date);
  const normalizedToday = normalizeDate(today);

  const isToday = normalizedDate.getTime() === normalizedToday.getTime();
  const isTomorrow =
    normalizedDate.getTime() === normalizedToday.getTime() + 86400000;

  const dateStr = normalizedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const weekdayStr = normalizedDate.toLocaleDateString("en-US", {
    weekday: "long",
  });

  if (isToday) {
    return `${dateStr} · Today · ${weekdayStr}`;
  } else if (isTomorrow) {
    return `${dateStr} · Tomorrow · ${weekdayStr}`;
  } else {
    return `${dateStr} · ${weekdayStr}`;
  }
}
