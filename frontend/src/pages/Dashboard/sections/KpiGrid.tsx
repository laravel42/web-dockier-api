import type { ReactNode } from "react";
import { statCardCls, typeStatDelta, typeStatLabel, typeStatValue } from "../../../utils/styles";
import FolderIcon from "../../../components/icons/outlined/FolderIcon";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import CheckCircleIcon from "../../../components/icons/outlined/CheckCircleIcon";
import AlertCircleIcon from "../../../components/icons/outlined/AlertCircleIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import WarningIcon from "../../../components/icons/outlined/WarningIcon";

interface KpiItem {
  label: string;
  value: number;
  delta: string;
  icon: ReactNode;
}

interface Props {
  projects: number;
  deploys: number;
  successDeploys: number;
  failedDeploys: number;
  scans: number;
  totalFindings: number;
  showDeploys?: boolean;
}

export default function KpiGrid({
  projects,
  deploys,
  successDeploys,
  failedDeploys,
  scans,
  totalFindings,
  showDeploys = true,
}: Props) {
  const iconCls = "size-4 text-primary-500";

  const kpis: KpiItem[] = [
    { label: "Projects", value: projects, delta: "Connected repositories", icon: <FolderIcon className={iconCls} /> },
    ...(showDeploys
      ? [
          { label: "Deployments", value: deploys, delta: "All time", icon: <RocketIcon className={iconCls} /> },
          { label: "Successful", value: successDeploys, delta: "Completed deploys", icon: <CheckCircleIcon className={iconCls} /> },
          { label: "Failed", value: failedDeploys, delta: "Needs attention", icon: <AlertCircleIcon className={iconCls} /> },
        ]
      : []),
    { label: "Scans", value: scans, delta: "Security runs", icon: <ShieldCheckIcon className={iconCls} /> },
    {
      label: "Findings",
      value: totalFindings,
      delta: totalFindings > 0 ? "Across all scans" : "No issues detected",
      icon: <WarningIcon className={iconCls} />,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
      {kpis.map((kpi) => (
        <div key={kpi.label} className={statCardCls}>
          <div className="flex items-center justify-between">
            <span className={typeStatLabel}>{kpi.label}</span>
            {kpi.icon}
          </div>
          <div className={`mt-3 ${typeStatValue}`}>{kpi.value}</div>
          <div className={`mt-1 ${typeStatDelta}`}>{kpi.delta}</div>
        </div>
      ))}
    </div>
  );
}
