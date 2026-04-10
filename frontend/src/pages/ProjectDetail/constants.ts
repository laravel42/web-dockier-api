import type { ReactNode } from "react";
import StarIcon from "../../components/icons/outlined/StarIcon";
import ShareIcon from "../../components/icons/outlined/ShareIcon";
import AlertCircleIcon from "../../components/icons/outlined/AlertCircleIcon";
import EyeIcon from "../../components/icons/outlined/EyeIcon";
import CodeIcon from "../../components/icons/outlined/CodeIcon";
import UsersIcon from "../../components/icons/outlined/UsersIcon";
import { createElement } from "react";
import type { RepoStats } from "./types";

export const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
export const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
export const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

export const langColors = [
  "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-teal-500", "bg-pink-500", "bg-lime-500", "bg-sky-500",
];

export function getKpiCards(stats: RepoStats | null): Array<{ label: string; value: string | number; icon: ReactNode }> {
  const iconCls = "w-5 h-5";
  return [
    { label: "Stars", value: stats?.stars ?? "-", icon: createElement(StarIcon, { className: iconCls }) },
    { label: "Forks", value: stats?.forks ?? "-", icon: createElement(ShareIcon, { className: iconCls }) },
    { label: "Open Issues", value: stats?.openIssues ?? "-", icon: createElement(AlertCircleIcon, { className: iconCls }) },
    { label: "Watchers", value: stats?.watchers ?? "-", icon: createElement(EyeIcon, { className: iconCls }) },
    { label: "Commits", value: stats?.totalCommits ?? "-", icon: createElement(CodeIcon, { className: iconCls }) },
    { label: "Contributors", value: stats?.contributors ?? "-", icon: createElement(UsersIcon, { className: iconCls }) },
  ];
}
