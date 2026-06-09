import { cardCls, typeStatLabel, typeStatValueSm } from "../../../utils/styles";
import type { ScanProgress, ScanSummary } from "../../../types";

interface Props {
  summary: ScanSummary;
  severityFilter: string;
  onFilterChange: (severity: string) => void;
  scanRunning?: boolean;
  progress?: ScanProgress | null;
}

export default function SummaryCards({
  summary,
  severityFilter,
  onFilterChange,
  scanRunning = false,
  progress = null,
}: Props) {
  const liveProgress = scanRunning ? progress : null;
  const filesScanned = liveProgress?.filesScanned ?? summary.filesScanned ?? 0;
  const filesInRepo = liveProgress?.filesInRepo ?? summary.filesInRepo ?? 0;
  const totalFindings = liveProgress?.findingsCount ?? summary.totalFindings;

  const cards = [
    {
      label: "Files",
      value: `${filesScanned}/${filesInRepo}`,
      color: scanRunning ? "text-primary" : "text-text-muted",
      filter: null,
    },
    { label: "Total", value: totalFindings, color: "text-text", filter: "" },
    { label: "Errors", value: summary.errors, color: "text-danger-500", filter: "error" },
    { label: "Warnings", value: summary.warnings, color: "text-warning-500", filter: "warning" },
    { label: "Info", value: summary.infos, color: "text-primary-500", filter: "info" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
      {cards.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => c.filter !== null && onFilterChange(c.filter)}
          className={`${cardCls} px-3 py-2.5 text-center transition-all ${c.filter !== null && severityFilter === c.filter ? "ring-2 ring-primary-500/40" : "hover:bg-card/60"} ${c.filter === null ? "cursor-default pointer-events-none" : ""} ${c.label === "Files" && scanRunning ? "ring-1 ring-primary/30" : ""}`}
        >
          <p className={`${typeStatValueSm} ${c.color} tabular-nums`}>{c.value}</p>
          <p className={`${typeStatLabel} mt-1 normal-case tracking-normal`}>{c.label}</p>
        </button>
      ))}
    </div>
  );
}
