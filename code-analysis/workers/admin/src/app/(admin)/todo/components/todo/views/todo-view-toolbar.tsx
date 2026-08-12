"use client";

import {
  Calendar,
  Filter,
  LayoutGrid,
  List,
  SortAsc,
  Star,
  X,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { Project } from "../../../data/data";
import type { Priority } from "../../../lib/config/priorities";
import { PriorityFlag } from "../priority-flag";

export type ViewMode = "list" | "kanban" | "calendar";
export type SortOption =
  | "manual"
  | "dueDate"
  | "priority"
  | "title"
  | "createdAt"
  | "updatedAt";

export interface TodoFilters {
  projects: string[];
  priorities: string[];
  labels: string[];
  starredOnly: boolean;
}

interface TodoViewToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filters: TodoFilters;
  onFiltersChange: (filters: TodoFilters) => void;
  projects: Project[];
  totalCount: number;
}

export function TodoViewToolbar({
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  filters,
  onFiltersChange,
  projects,
  totalCount,
}: TodoViewToolbarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFilterCount =
    filters.projects.length +
    filters.priorities.length +
    (filters.starredOnly ? 1 : 0);

  const toggleProject = (projectId: string) => {
    const newProjects = filters.projects.includes(projectId)
      ? filters.projects.filter((id) => id !== projectId)
      : [...filters.projects, projectId];
    onFiltersChange({ ...filters, projects: newProjects });
  };

  const togglePriority = (priority: string) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((p) => p !== priority)
      : [...filters.priorities, priority];
    onFiltersChange({ ...filters, priorities: newPriorities });
  };

  const clearFilters = () => {
    onFiltersChange({
      projects: [],
      priorities: [],
      labels: [],
      starredOnly: false,
    });
  };

  const getSortBadge = (sort: SortOption): string => {
    switch (sort) {
      case "manual":
        return "M";
      case "dueDate":
        return "D";
      case "priority":
        return "P";
      case "title":
        return "A";
      case "createdAt":
        return "C";
      case "updatedAt":
        return "U";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* View Mode Selector */}
        <div className="flex items-center gap-1 rounded-md border p-1">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("list")}
            className="h-8 px-3"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">List</span>
          </Button>
          <Button
            variant={viewMode === "kanban" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("kanban")}
            className="h-8 px-3"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Kanban</span>
          </Button>
          <Button
            variant={viewMode === "calendar" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("calendar")}
            className="h-8 px-3"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Filter Dropdown */}
        <DropdownMenu open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-4 w-4" />
              Filter
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Filter by</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Starred Filter */}
            <DropdownMenuCheckboxItem
              checked={filters.starredOnly}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, starredOnly: checked })
              }
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  filters.starredOnly && "fill-yellow-500 text-yellow-500",
                )}
              />
              Starred only
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            {/* Project Filters */}
            <DropdownMenuLabel className="text-xs">Projects</DropdownMenuLabel>
            {projects.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={filters.projects.includes(project.id)}
                onCheckedChange={() => toggleProject(project.id)}
              >
                {project.name}
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />

            {/* Priority Filters */}
            <DropdownMenuLabel className="text-xs">Priority</DropdownMenuLabel>
            {["P1", "P2", "P3", "P4"].map((priority) => (
              <DropdownMenuCheckboxItem
                key={priority}
                checked={filters.priorities.includes(priority)}
                onCheckedChange={() => togglePriority(priority)}
              >
                <PriorityFlag priority={priority as Priority} />
                {priority}
              </DropdownMenuCheckboxItem>
            ))}

            {activeFilterCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4" />
                  Clear filters
                </Button>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <SortAsc className="h-4 w-4" />
              Sort
              <Badge variant="secondary" className="px-1.5 py-0">
                {getSortBadge(sortBy)}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortBy}
              onValueChange={(value) => onSortChange(value as SortOption)}
            >
              <DropdownMenuRadioItem value="manual">
                Manual Order
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dueDate">
                Due Date
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="priority">
                Priority
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="title">
                Title (A-Z)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="createdAt">
                Date Created
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="updatedAt">
                Last Updated
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="text-muted-foreground ml-auto text-sm">
          {totalCount} {totalCount === 1 ? "task" : "tasks"}
        </div>
      </div>
    </div>
  );
}
