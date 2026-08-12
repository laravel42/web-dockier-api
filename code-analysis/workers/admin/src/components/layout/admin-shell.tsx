"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  defaultOpen: boolean;
}

export function AdminShell({ children, defaultOpen }: Props) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <div
        id="content"
        className={cn(
          "flex h-full w-full min-w-0 flex-col",
          "has-[div[data-layout=fixed]]:h-svh",
          "group-data-[scroll-locked=1]/body:h-full",
          "has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh",
        )}
      >
        {children}
      </div>
    </SidebarProvider>
  );
}
