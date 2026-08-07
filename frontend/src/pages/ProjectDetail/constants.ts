import type { ReactNode } from "react";
import { createElement } from "react";
import type { RepoStats } from "@/types";
import { CircleAlertIcon, CodeXmlIcon, EyeIcon, Share2Icon, StarIcon, UsersIcon } from "lucide-react";

export const langColors = [
  "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-teal-500", "bg-pink-500", "bg-lime-500", "bg-sky-500",
];

export function getKpiCards(stats: RepoStats | null): Array<{ label: string; value: string | number; icon: ReactNode }> {
  const iconCls = "w-5 h-5";
  return [
    { label: "Stars", value: stats?.stars ?? "-", icon: createElement(StarIcon, { className: iconCls }) },
    { label: "Forks", value: stats?.forks ?? "-", icon: createElement(Share2Icon, { className: iconCls }) },
    { label: "Open Issues", value: stats?.openIssues ?? "-", icon: createElement(CircleAlertIcon, { className: iconCls }) },
    { label: "Watchers", value: stats?.watchers ?? "-", icon: createElement(EyeIcon, { className: iconCls }) },
    { label: "Commits", value: stats?.totalCommits ?? "-", icon: createElement(CodeXmlIcon, { className: iconCls }) },
    { label: "Contributors", value: stats?.contributors ?? "-", icon: createElement(UsersIcon, { className: iconCls }) },
  ];
}
