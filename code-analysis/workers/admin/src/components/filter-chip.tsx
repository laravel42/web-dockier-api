"use client";

import { X } from "@/components/icons/lucide-icons";

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <div className="border-border/60 bg-muted flex h-8 max-w-[200px] min-w-0 items-center gap-1.5 rounded-md border px-3 text-sm">
      <span className="truncate">{label}</span>
      <button
        onClick={onRemove}
        className="hover:bg-accent ml-0.5 flex-shrink-0 rounded-md p-0.5"
      >
        <X className="h-3.5 w-3.5" weight="bold" />
      </button>
    </div>
  );
}
