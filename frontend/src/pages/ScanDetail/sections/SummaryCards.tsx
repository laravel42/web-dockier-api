import { cardCls } from "../../../utils/styles";
import type { ScanSummary } from "../../../types";

interface Props {
  summary: ScanSummary;
  severityFilter: string;
  onFilterChange: (severity: string) => void;
}

export default function SummaryCards({ summary, severityFilter, onFilterChange }: Props) {
  const cards = [
    { label: "Files", value: `${summary.filesScanned ?? 0}/${summary.filesInRepo ?? 0}`, color: "text-text-secondary", filter: null },
    { label: "Total", value: summary.totalFindings, color: "text-text", filter: "" },
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
          className={`${cardCls} px-3 py-2 text-center transition-all ${c.filter !== null && severityFilter === c.filter ? "ring-2 ring-primary-500" : "hover:shadow-md"} ${c.filter === null ? "cursor-default" : ""}`}
        >
          <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          <p className="text-[10px] text-text-muted">{c.label}</p>
        </button>
      ))}
    </div>
  );
}
