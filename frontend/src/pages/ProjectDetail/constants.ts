import type { ReactNode } from "react";
import { createElement } from "react";
import type { RepoStats } from "@/types";
import { CircleAlertIcon, EyeIcon, GitCommitHorizontalIcon, GitForkIcon, StarIcon, UsersIcon } from "lucide-react";

export const langColors = [
  "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-teal-500", "bg-pink-500", "bg-lime-500", "bg-sky-500",
];

export function getKpiCards(stats: RepoStats | null): Array<{ label: string; value: string | number; icon: ReactNode }> {
  const iconCls = "size-3.5 shrink-0 text-text-muted";
  return [
    { label: "Stars", value: stats?.stars ?? "-", icon: createElement(StarIcon, { className: iconCls }) },
    { label: "Forks", value: stats?.forks ?? "-", icon: createElement(GitForkIcon, { className: iconCls }) },
    { label: "Open Issues", value: stats?.openIssues ?? "-", icon: createElement(CircleAlertIcon, { className: iconCls }) },
    { label: "Watchers", value: stats?.watchers ?? "-", icon: createElement(EyeIcon, { className: iconCls }) },
    { label: "Commits", value: stats?.totalCommits ?? "-", icon: createElement(GitCommitHorizontalIcon, { className: iconCls }) },
    { label: "Contributors", value: stats?.contributors ?? "-", icon: createElement(UsersIcon, { className: iconCls }) },
  ];
}
