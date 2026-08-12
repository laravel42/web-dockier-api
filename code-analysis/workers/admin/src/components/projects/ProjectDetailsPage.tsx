"use client";

import { CalendarDays, CheckCircle2, Files, Gauge } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LinkSimple, SquareHalf } from "@/components/icons/lucide-icons";
import { ProjectManagementIssueGantt1 } from "@/components/project-management/issue-gantt-1";
import { ProjectManagementIssueKanban1 } from "@/components/project-management/issue-kanban-1";
import { ProjectManagementIssueSpreadsheet1 } from "@/components/project-management/issue-spreadsheet-1";
import { Breadcrumbs } from "@/components/projects/Breadcrumbs";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { RecentFileCard } from "@/components/projects/RecentFileCard";
import { RightMetaPanel } from "@/components/projects/RightMetaPanel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectDetails } from "@/lib/data/project-details";
import {
  getProjectDetailsById,
  getProjectTasks,
} from "@/lib/data/project-details";
import { cn } from "@/lib/utils";

type ProjectDetailsPageProps = {
  projectId: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; project: ProjectDetails };

export function ProjectDetailsPage({ projectId }: ProjectDetailsPageProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [showMeta, setShowMeta] = useState(true);
  const [isMobileMetaOpen, setIsMobileMetaOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    const delay = 600 + Math.floor(Math.random() * 301);
    const t = setTimeout(() => {
      if (cancelled) return;
      const project = getProjectDetailsById(projectId);
      setState({ status: "ready", project });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [projectId]);

  const copyLink = useCallback(async () => {
    if (!navigator.clipboard) {
      toast.error("Clipboard not available");
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }, []);

  const projectName =
    state.status === "ready" ? state.project.name : "Project Details";

  const breadcrumbs = useMemo(
    () => [{ label: "Projects", href: "/" }, { label: projectName }],
    [projectName],
  );

  if (state.status === "loading") {
    return <ProjectDetailsSkeleton />;
  }

  const project = state.project;
  const tasks = getProjectTasks(project);
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const recentFiles = project.files.slice(0, 6);
  const activityItems = [
    ...project.notes.slice(0, 3).map((note) => ({
      id: note.id,
      title: note.title,
      actor: note.addedBy,
      action: note.noteType === "audio" ? "added a voice note" : "added a note",
      date: note.addedDate,
      detail:
        note.content ??
        note.audioData?.aiSummary ??
        "Project note captured for the team.",
    })),
    ...recentFiles.slice(0, 3).map((file) => ({
      id: file.id,
      title: file.name,
      actor: file.addedBy,
      action: `uploaded a ${file.type.toUpperCase()} file`,
      date: file.addedDate,
      detail: `${file.sizeMB.toFixed(1)} MB added to project files`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  const dueDateLabel = project.time.dueDate.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const snapshotItems = [
    {
      label: "Timeline health",
      value: `${project.time.progressPercent}%`,
      detail: project.time.daysRemainingLabel,
      icon: Gauge,
    },
    {
      label: "Due date",
      value: dueDateLabel,
      detail: project.time.estimateLabel,
      icon: CalendarDays,
    },
    {
      label: "Tasks closed",
      value: `${completedTasks}/${tasks.length}`,
      detail: `${Math.max(tasks.length - completedTasks, 0)} open tasks`,
      icon: CheckCircle2,
    },
    {
      label: "Project files",
      value: String(project.files.length),
      detail: `${project.quickLinks.length} quick links`,
      icon: Files,
    },
  ];

  return (
    <main className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto xl:flex-row xl:overflow-hidden">
        <div className="flex max-w-full min-w-0 flex-1 flex-col xl:overflow-hidden">
          <div className="border-border flex min-h-14 items-center justify-between gap-4 border-b px-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <Breadcrumbs items={breadcrumbs} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy link"
                onClick={copyLink}
              >
                <LinkSimple className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open project details panel"
                className="xl:hidden"
                onClick={() => setIsMobileMetaOpen(true)}
              >
                <SquareHalf className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={showMeta}
                aria-label={
                  showMeta ? "Collapse meta panel" : "Expand meta panel"
                }
                className={cn("hidden xl:inline-flex", showMeta && "bg-muted")}
                onClick={() => setShowMeta((v) => !v)}
              >
                <SquareHalf className="size-4" />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 xl:overflow-y-auto">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:gap-7">
              <ProjectHeader project={project} />

              <section className="border-border bg-muted/20 grid grid-cols-2 overflow-hidden border-y xl:grid-cols-4 xl:border-x-0">
                {snapshotItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="border-border/70 min-w-0 border-b p-3.5 even:border-l sm:p-4 xl:border-b-0 xl:border-l xl:first:border-l-0 [&:nth-last-child(-n+2)]:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="text-muted-foreground size-3.5 shrink-0" />
                        <p className="text-muted-foreground min-w-0 truncate text-xs font-medium">
                          {item.label}
                        </p>
                      </div>
                      <div className="mt-2 flex min-w-0 flex-col gap-1 xl:flex-row xl:items-end xl:justify-between xl:gap-3">
                        <p className="min-w-0 truncate text-lg font-semibold tracking-tight">
                          {item.value}
                        </p>
                        <p className="text-muted-foreground min-w-0 truncate text-xs xl:shrink-0">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="space-y-3">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Project brief
                </p>
                <p className="text-muted-foreground max-w-4xl text-sm leading-6">
                  {project.description}
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Project files
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {recentFiles.map((file) => (
                    <RecentFileCard key={file.id} file={file} />
                  ))}
                </div>
              </section>

              <Tabs
                defaultValue="timeline"
                className="flex min-w-0 flex-col gap-6"
              >
                <div className="overflow-x-auto border-b">
                  <TabsList className="inline-flex h-auto min-w-max justify-start gap-7 rounded-none bg-transparent p-0 sm:gap-8">
                    {[
                      ["timeline", "Timeline"],
                      ["tasks", "Tasks"],
                      ["issues", "Issues"],
                      ["activity", "Activity"],
                    ].map(([value, label]) => (
                      <TabsTrigger
                        key={value}
                        value={value}
                        className="data-[state=active]:border-foreground shrink-0 rounded-none border-b-2 border-transparent px-0 pb-3 text-sm shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:pb-4"
                      >
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <TabsContent value="timeline" className="mt-0">
                  <section className="border-border h-[560px] overflow-hidden border-y">
                    <ProjectManagementIssueGantt1 embedded />
                  </section>
                </TabsContent>

                <TabsContent value="tasks" className="mt-0">
                  <section className="border-border h-[560px] overflow-hidden border-y">
                    <ProjectManagementIssueKanban1 embedded openBoard />
                  </section>
                </TabsContent>

                <TabsContent value="issues" className="mt-0">
                  <section className="border-border h-[560px] overflow-hidden border-y">
                    <ProjectManagementIssueSpreadsheet1 embedded />
                  </section>
                </TabsContent>

                <TabsContent value="activity" className="mt-0">
                  <section className="border-border border-y py-6">
                    <div>
                      {activityItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-[22px_1fr] gap-3 pb-5 last:pb-0"
                        >
                          <div className="relative flex justify-center pt-1.5">
                            <span
                              className={
                                index === 0
                                  ? "bg-foreground size-2.5 rounded-full"
                                  : "bg-muted-foreground/35 size-2.5 rounded-full"
                              }
                            />
                            {index < activityItems.length - 1 ? (
                              <span className="bg-border absolute top-5 bottom-0 w-px" />
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <div className="flex min-w-0 items-baseline justify-between gap-4">
                              <p className="text-foreground truncate text-sm font-semibold">
                                {item.title}
                              </p>
                              <time className="text-muted-foreground shrink-0 text-sm">
                                {item.date.toLocaleDateString(undefined, {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </time>
                            </div>
                            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-6">
                              {item.actor.name} {item.action}. {item.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        {showMeta ? (
          <aside className="border-border bg-card text-card-foreground hidden min-h-0 w-[340px] min-w-0 shrink-0 flex-col overflow-hidden border-l xl:flex">
            <RightMetaPanel project={project} />
          </aside>
        ) : null}
      </div>

      <Sheet open={isMobileMetaOpen} onOpenChange={setIsMobileMetaOpen}>
        <SheetContent
          side="right"
          className="flex w-[86vw] max-w-sm flex-col gap-0 p-0"
        >
          <SheetHeader className="border-border border-b px-5 py-4 pr-12 text-left">
            <SheetTitle>Project details</SheetTitle>
            <SheetDescription>
              Status, contributors, schedule, and notes
            </SheetDescription>
          </SheetHeader>
          <RightMetaPanel project={project} />
        </SheetContent>
      </Sheet>
    </main>
  );
}

function ProjectDetailsSkeleton() {
  return (
    <main className="bg-background flex h-full min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="mt-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-8 w-[360px]" />
          <Skeleton className="mt-3 h-5 w-[520px]" />
          <Skeleton className="mt-5 h-px w-full" />
          <Skeleton className="mt-5 h-16 w-full" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>

          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}
