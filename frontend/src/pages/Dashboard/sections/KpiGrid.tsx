import type { ReactNode } from "react";
import { cardCls } from "../../../utils/styles";
import FolderIcon from "../../../components/icons/outlined/FolderIcon";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import CheckCircleIcon from "../../../components/icons/outlined/CheckCircleIcon";
import AlertCircleIcon from "../../../components/icons/outlined/AlertCircleIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import WarningIcon from "../../../components/icons/outlined/WarningIcon";

interface KpiItem {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
  onClick: () => void;
}

interface Props {
  projects: number;
  deploys: number;
  successDeploys: number;
  failedDeploys: number;
  scans: number;
  totalFindings: number;
  onNavigate: (path: string) => void;
  showDeploys?: boolean;
}

export default function KpiGrid({ projects, deploys, successDeploys, failedDeploys, scans, totalFindings, onNavigate, showDeploys = true }: Props) {
  const iconCls = "w-5 h-5";
  const kpis: KpiItem[] = [
    { label: "Projects", value: projects, icon: <FolderIcon className={iconCls} />, color: "text-primary-500", onClick: () => onNavigate("/projects") },
    ...(showDeploys ? [
      { label: "Deployments", value: deploys, icon: <RocketIcon className={iconCls} />, color: "text-primary-500", onClick: () => onNavigate("/deploy") },
      { label: "Successful", value: successDeploys, icon: <CheckCircleIcon className={iconCls} />, color: "text-success-500", onClick: () => onNavigate("/deploy") },
      { label: "Failed", value: failedDeploys, icon: <AlertCircleIcon className={iconCls} />, color: "text-danger-500", onClick: () => onNavigate("/deploy") },
    ] : []),
    { label: "Scans", value: scans, icon: <ShieldCheckIcon className={iconCls} />, color: "text-success-500", onClick: () => onNavigate("/security") },
    { label: "Findings", value: totalFindings, icon: <WarningIcon className={iconCls} />, color: totalFindings > 0 ? "text-warning-500" : "text-text-muted", onClick: () => onNavigate("/security") },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      {kpis.map((kpi) => (
        <button
          key={kpi.label}
          type="button"
          onClick={kpi.onClick}
          className={`${cardCls} p-4 text-center hover:shadow-md transition-all`}
        >
          <div className={`mx-auto mb-2 ${kpi.color} flex justify-center`}>{kpi.icon}</div>
          <p className="text-xl font-bold text-text">{kpi.value}</p>
          <p className="text-xs text-text-muted mt-1">{kpi.label}</p>
        </button>
      ))}
    </div>
  );
}
