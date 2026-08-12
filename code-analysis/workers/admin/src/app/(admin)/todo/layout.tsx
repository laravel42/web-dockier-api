"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { todoRoutes } from "@/lib/todo-routes";
import { cn } from "@/lib/utils";

import { SearchDialog } from "./components/common/search-dialog";
import { NavActions } from "./components/nav/nav-actions";
import {
  TodoDisplayPrefsProvider,
  useTodoDisplayPrefs,
} from "./contexts/todo-display-prefs-context";
import { useViewMode, ViewModeProvider } from "./contexts/view-mode-context";
import { projects } from "./data/data";

interface TodoLayoutProps {
  children: React.ReactNode;
  modal: React.ReactNode;
}

export default function TodoLayout({ children, modal }: TodoLayoutProps) {
  return (
    <TodoDisplayPrefsProvider>
      <ViewModeProvider>
        <TodoDisplayScope>
          <TodoLayoutContent modal={modal}>{children}</TodoLayoutContent>
        </TodoDisplayScope>
      </ViewModeProvider>
    </TodoDisplayPrefsProvider>
  );
}

function TodoDisplayScope({ children }: { children: React.ReactNode }) {
  const { prefs } = useTodoDisplayPrefs();
  return (
    <div
      data-todo-prefs=""
      data-font-size={prefs.fontSize}
      data-density={prefs.density}
      data-font-text={prefs.fontText}
      data-font-display={prefs.fontDisplay}
      className="contents"
    >
      {children}
    </div>
  );
}

function TodoLayoutContent({ children, modal }: TodoLayoutProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const breadcrumbLabel = getBreadcrumbLabel(pathname);
  const { viewMode } = useViewMode();
  const isTaskModalOpen =
    pathname.startsWith(`${todoRoutes.base}/task/`) && modal != null;
  const isFullPageRoute =
    pathname === todoRoutes.createTask ||
    (pathname.startsWith(`${todoRoutes.base}/task/`) && !isTaskModalOpen);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-6">
          <div className="flex flex-1 items-center gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="line-clamp-1">
                    {breadcrumbLabel}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <NavActions onSearchClick={() => setSearchOpen(true)} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div
            className={cn(
              "flex flex-1 flex-col gap-6 py-6",
              viewMode === "kanban" || viewMode === "calendar"
                ? "px-4 sm:px-6"
                : "px-6",
            )}
          >
            <div
              className={cn(
                "w-full space-y-6 transition-all duration-300",
                viewMode === "list" && !isFullPageRoute && "mx-auto max-w-3xl",
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      {modal}
    </>
  );
}

function getBreadcrumbLabel(pathname: string): string {
  if (pathname === todoRoutes.all) return "All Tasks";
  if (pathname === todoRoutes.createTask) return "Create Task";
  if (pathname === todoRoutes.today) return "Today";
  if (pathname === todoRoutes.upcoming) return "Upcoming";
  if (pathname === todoRoutes.important) return "Important";
  if (pathname === todoRoutes.activity) return "Activity";
  if (pathname === todoRoutes.settings) return "Settings";
  if (pathname === todoRoutes.deleted) return "Trash";
  if (pathname === todoRoutes.notifications) return "Notifications";

  const projectPrefix = `${todoRoutes.base === "/" ? "" : todoRoutes.base}/projects/`;
  if (pathname.startsWith(projectPrefix)) {
    const projectId = pathname.slice(projectPrefix.length);
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Project";
  }

  return "Tasks";
}
