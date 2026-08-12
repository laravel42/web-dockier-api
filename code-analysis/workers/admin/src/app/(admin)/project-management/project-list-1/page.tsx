"use client";

import { FolderKanban, Plus, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import {
  getProjectManagementInitials,
  projectManagementMembers,
} from "@/components/project-management/people-data";
import {
  filterAndSortProjects,
  type ProjectRecord,
} from "@/components/project-management/project-list-shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function MemberStack({ members }: { members: ProjectRecord["members"] }) {
  const preview = members.slice(0, 3).map((member) => {
    const details = projectManagementMembers.find(
      (pm) => pm.name === member.name,
    );
    return {
      name: member.name,
      avatar: details?.avatar,
      initials: getProjectManagementInitials(member.name),
    };
  });
  const hiddenCount = Math.max(members.length - preview.length, 0);

  return (
    <div className="flex -space-x-2">
      {preview.map((member) => (
        <Avatar
          key={member.name}
          className="border-background size-7 border-2"
          title={member.name}
        >
          <AvatarImage src={member.avatar} alt={member.name} />
          <AvatarFallback className="text-[10px] font-medium">
            {member.initials}
          </AvatarFallback>
        </Avatar>
      ))}
      {hiddenCount > 0 && (
        <span className="border-background bg-muted text-muted-foreground grid size-7 place-items-center rounded-full border-2 text-[10px] font-medium">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

export default function ProjectListTablePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects({
        searchQuery: deferredSearchQuery,
        sortOption: "newest",
        teamSizeFilter: "all",
        updatedWindow: "all",
        statusFilter: ["Active", "Archived"],
      }),
    [deferredSearchQuery],
  );

  return (
    <main
      id="main-content"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div className="border-b">
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
            <FolderKanban className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">Projects</span>
            <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs">
              {visibleProjects.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-[220px]">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search projects..."
                className="h-8 rounded-md pl-8 text-sm shadow-none"
              />
            </div>
            <Button size="sm" className="h-8 gap-1.5">
              <Plus className="size-3.5" />
              Add Project
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProjects.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No projects found matching the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleProjects.map((project) => {
                  const progress = project.meta.timelineHealth;
                  const progressColor =
                    progress >= 70
                      ? "bg-emerald-500"
                      : progress >= 40
                        ? "bg-amber-500"
                        : "bg-red-500";

                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {project.description}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {project.code}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            project.state === "Active" ? "default" : "secondary"
                          }
                        >
                          {project.state}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{project.meta.cycle}</div>
                        <div className="text-xs text-muted-foreground">
                          {project.meta.cycleDuration}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="h-1.5 flex-1 rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${progressColor}`}
                              style={{
                                width: `${Math.min(100, progress)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-8 text-right">
                            {progress}%
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {project.meta.tasksClosed}/{project.meta.tasksTotal}{" "}
                          done
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {project.meta.dueDate}
                      </TableCell>
                      <TableCell>
                        <MemberStack members={project.members} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {project.updatedAt}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
}
