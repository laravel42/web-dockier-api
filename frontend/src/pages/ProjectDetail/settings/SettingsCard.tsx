import type { ReactNode } from "react";

interface SettingsCardProps {
  children: ReactNode;
  /** Add inner padding. Default: false (use for cards containing SettingsRow). */
  padded?: boolean;
  className?: string;
}

/**
 * Standard card wrapper for settings sections.
 *
 * Two modes:
 * - `padded` — adds `p-4` for free-form content (editors, notes, forms)
 * - default (no padding) — `overflow-hidden` for SettingsRow-based cards with internal borders
 */
export default function SettingsCard({ children, padded = false, className = "" }: SettingsCardProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-card/40 ${padded ? "p-4" : "overflow-hidden"} ${className}`}
    >
      {children}
    </div>
  );
}
