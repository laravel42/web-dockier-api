"use client";

import { MoreHorizontal, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { CreateIssueSheet } from "../create-issue-sheet";
import { type CreateIssueDefaults, createProjectIssue } from "../issue-core";
import { INITIAL_GANTT_ISSUES, PROJECT_ICON, PROJECT_TABS } from "./data";
import { TODAY } from "./data";
import { IssueGanttQuickAdd } from "./quick-add";
import { IssueGanttTimeline } from "./timeline";
import { IssueGanttToolbar } from "./toolbar";
import type { GanttIssue, IssueStatus, TimelineView } from "./types";
import { addDays, toIsoDate } from "./utils";

export function ProjectManagementIssueGantt1({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const ProjectIcon = PROJECT_ICON;
  const [issues, setIssues] = useState<GanttIssue[]>(INITIAL_GANTT_ISSUES);
  const [view, setView] = useState<TimelineView>("week");
  const [statusFilter, setStatusFilter] = useState<IssueStatus[]>([
    "Backlog",
    "Planned",
    "In Progress",
    "Review",
    "Done",
  ]);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [highlightToday, setHighlightToday] = useState(true);
  const [fullScreenMode, setFullScreenMode] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null);
  const [scrollToTodayRequest, setScrollToTodayRequest] = useState(0);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [createSheetDefaults, setCreateSheetDefaults] =
    useState<CreateIssueDefaults>({
      status: "Planned",
      startDate: toIsoDate(TODAY),
      targetDate: toIsoDate(addDays(TODAY, 3)),
    });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  const visibleIssues = useMemo(
    () =>
      issues.filter((issue) => {
        const matchesStatus = statusFilter.includes(issue.status);
        const matchesScheduling =
          showUnscheduled || Boolean(issue.startDate && issue.targetDate);

        return matchesStatus && matchesScheduling;
      }),
    [issues, showUnscheduled, statusFilter],
  );

  useEffect(() => {
    if (
      activeIssueId &&
      !visibleIssues.some((issue) => issue.id === activeIssueId)
    ) {
      setActiveIssueId(null);
    }
  }, [activeIssueId, visibleIssues]);

  useEffect(() => {
    if (!fullScreenMode) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullScreenMode(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [fullScreenMode]);

  const toggleStatus = (status: IssueStatus) => {
    setStatusFilter((currentStatuses) => {
      const nextStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((value) => value !== status)
        : [...currentStatuses, status];

      return nextStatuses.length > 0 ? nextStatuses : currentStatuses;
    });
  };

  const addWorkItem = () => {
    setCreateSheetDefaults({
      status: "Planned",
      startDate: toIsoDate(TODAY),
      targetDate: toIsoDate(addDays(TODAY, 3)),
    });
    setIsCreateSheetOpen(true);
  };

  const submitQuickAdd = () => {
    const trimmedTitle = quickAddTitle.trim();

    if (trimmedTitle.length === 0) return;

    setIssues((currentIssues) => [
      ...currentIssues,
      createProjectIssue(
        {
          title: trimmedTitle,
          description: "",
          status: "Planned",
          priority: null,
          startDate: toIsoDate(TODAY),
          targetDate: toIsoDate(addDays(TODAY, 3)),
        },
        currentIssues.length,
      ),
    ]);

    setQuickAddTitle("");
    setIsQuickAddOpen(true);
  };

  const handleCreateIssue = (
    values: Parameters<typeof createProjectIssue>[0],
  ) => {
    setIssues((currentIssues) => [
      ...currentIssues,
      createProjectIssue(values, currentIssues.length),
    ]);
  };

  const handleViewChange = (nextView: TimelineView) => {
    setView(nextView);
    setScrollToTodayRequest((current) => current + 1);
  };

  return (
    <main
      id="main-content"
      className={cn(
        "bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden",
        fullScreenMode &&
          "bg-background fixed inset-4 z-50 rounded-xl border shadow-2xl",
      )}
    >
      {!embedded ? (
        <div className="border-b">
          <div className="flex min-h-14 items-center gap-4 px-4 sm:px-6">
            <div className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
              <div className="flex shrink-0 items-center gap-2 pr-1">
                <div className="bg-muted text-foreground flex size-7 items-center justify-center rounded-md">
                  <ProjectIcon className="size-4" />
                </div>
                <span className="text-foreground/85 max-w-48 truncate px-2 text-[14px] font-medium">
                  Renewal Forecast Console
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-md"
                aria-label="Project options"
              >
                <MoreHorizontal className="size-4" />
              </Button>

              <div className="mx-4 h-5 w-px shrink-0 border-l" />

              <div className="flex items-center gap-1">
                {PROJECT_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={cn(
                      "relative z-10 flex items-center rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                      tab === "Issues"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {tab}
                    {tab === "Issues" ? (
                      <span className="bg-foreground absolute bottom-[-14px] left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Filter issues"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Issue filters</DropdownMenuLabel>
                  {(
                    [
                      "Backlog",
                      "Planned",
                      "In Progress",
                      "Review",
                      "Done",
                    ] as IssueStatus[]
                  ).map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={statusFilter.includes(status)}
                      onCheckedChange={() => toggleStatus(status)}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={showUnscheduled}
                    onCheckedChange={(checked) =>
                      setShowUnscheduled(Boolean(checked))
                    }
                  >
                    Include unscheduled items
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={highlightToday}
                    onCheckedChange={(checked) =>
                      setHighlightToday(Boolean(checked))
                    }
                  >
                    Highlight today
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                onClick={addWorkItem}
              >
                <Plus className="size-3.5" />
                Add issue
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!embedded ? (
        <IssueGanttToolbar
          issueCount={visibleIssues.length}
          view={view}
          onViewChange={handleViewChange}
          onToday={() => setScrollToTodayRequest((current) => current + 1)}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <IssueGanttTimeline
          key={view}
          issues={visibleIssues}
          view={embedded ? "week" : view}
          embedded={embedded}
          highlightToday={highlightToday}
          scrollToTodayRequest={scrollToTodayRequest}
          activeIssueId={activeIssueId}
          hoveredIssueId={hoveredIssueId}
          quickAdd={
            <IssueGanttQuickAdd
              isOpen={isQuickAddOpen}
              projectIdentifier="RFC"
              title={quickAddTitle}
              onTitleChange={setQuickAddTitle}
              onOpen={() => setIsQuickAddOpen(true)}
              onClose={() => {
                setIsQuickAddOpen(false);
                setQuickAddTitle("");
              }}
              onSubmit={submitQuickAdd}
            />
          }
          onActiveIssueChange={setActiveIssueId}
          onHoveredIssueChange={setHoveredIssueId}
          onIssuesChange={setIssues}
        />
      </div>

      <CreateIssueSheet
        open={isCreateSheetOpen}
        defaults={createSheetDefaults}
        onOpenChange={setIsCreateSheetOpen}
        onCreateIssue={handleCreateIssue}
      />
    </main>
  );
}
