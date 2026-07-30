import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with deduplication and conflict resolution.
 * Combines clsx (conditional classes) with tailwind-merge (last-wins for conflicts).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
