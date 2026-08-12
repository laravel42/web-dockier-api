/**
 * Centralized priority configuration
 * Single source of truth for all priority-related logic
 */

export type Priority = "P1" | "P2" | "P3" | "P4";

export interface PriorityConfig {
  value: Priority;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
  sortOrder: number;
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  P1: {
    value: "P1",
    label: "P1 - Urgent",
    shortLabel: "Priority 1",
    color: "text-priority-1",
    description: "Urgent",
    sortOrder: 1,
  },
  P2: {
    value: "P2",
    label: "P2 - High",
    shortLabel: "Priority 2",
    color: "text-priority-2",
    description: "High",
    sortOrder: 2,
  },
  P3: {
    value: "P3",
    label: "P3 - Medium",
    shortLabel: "Priority 3",
    color: "text-priority-3",
    description: "Medium",
    sortOrder: 3,
  },
  P4: {
    value: "P4",
    label: "P4 - Low",
    shortLabel: "Priority 4",
    color: "text-priority-4",
    description: "Low",
    sortOrder: 4,
  },
} as const;

/**
 * Array of all priorities for iteration
 */
export const PRIORITIES = Object.values(PRIORITY_CONFIG);

/**
 * Get the color class for a priority
 */
export function getPriorityColor(priority?: Priority): string {
  if (!priority) return "text-muted-foreground";
  return PRIORITY_CONFIG[priority].color;
}

/**
 * Get the label for a priority
 * @param format 'full' for "P1 - Urgent", 'short' for "Priority 1", 'code' for "P1"
 */
export function getPriorityLabel(
  priority?: Priority,
  format: "full" | "short" | "code" = "full",
): string {
  if (!priority) return "No priority";

  switch (format) {
    case "full":
      return PRIORITY_CONFIG[priority].label;
    case "short":
      return PRIORITY_CONFIG[priority].shortLabel;
    case "code":
      return PRIORITY_CONFIG[priority].value;
    default:
      return PRIORITY_CONFIG[priority].label;
  }
}
