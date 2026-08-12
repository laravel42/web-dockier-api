"use client";

import React from "react";

import { cn } from "@/lib/utils";

interface QuickCreateModalLayoutProps {
  open: boolean;
  onClose: () => void;
  isDescriptionExpanded?: boolean;
  onSubmitShortcut?: () => void;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export function QuickCreateModalLayout({
  open,
  onClose: _onClose,
  isDescriptionExpanded,
  onSubmitShortcut,
  className,
  contentClassName,
  children,
}: QuickCreateModalLayoutProps) {
  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onSubmitShortcut) return;

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmitShortcut();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "bg-background border-border flex w-full max-w-[720px] rounded-3xl border shadow-2xl transition-[height] duration-200",
          isDescriptionExpanded ? "h-[85vh]" : "h-auto",
          className,
        )}
        onKeyDown={handleKeyDown}
      >
        <div
          className={cn("flex flex-1 flex-col gap-3.5 p-4", contentClassName)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
