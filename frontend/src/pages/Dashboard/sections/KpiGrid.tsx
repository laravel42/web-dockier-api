import type { ReactNode } from "react";
import { statCardCls, typeStatDelta, typeStatLabel, typeStatValueSm } from "../../../utils/styles";
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
    <div className="mb-8 overflow-x-auto scrollbar-hide">
      <div className="flex min-w-full gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`${statCardCls} min-w-33 flex-1 p-3 sm:min-w-36 sm:p-4`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`${typeStatLabel} truncate`}>{kpi.label}</span>
              <span className="shrink-0">{kpi.icon}</span>
            </div>
            <div className={`mt-2 sm:mt-3 ${typeStatValueSm}`}>{kpi.value}</div>
            <div className={`mt-0.5 sm:mt-1 ${typeStatDelta} truncate`}>{kpi.delta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
