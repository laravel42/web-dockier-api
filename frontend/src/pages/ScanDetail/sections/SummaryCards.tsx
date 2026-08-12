import { cardCls, typeCaption, typeStatValueSm } from "@/utils/styles";
import { resolveFilteredCounts } from "@/utils/findingCounts";
import type { ScanProgress, ScanSummary, SecurityFindingCounts } from "@/types";

interface Props {
  summary: ScanSummary;
  severityFilter: string;
  providerFilter: string;
  findingCounts: SecurityFindingCounts | null;
  findingsTotal: number;
  onFilterChange: (severity: string) => void;
  scanRunning?: boolean;
  progress?: ScanProgress | null;
}

type CardTone = "neutral" | "error" | "warning" | "info";

interface SummaryCard {
  label: string;
  value: string | number;
  filter: string | null;
  tone: CardTone;
}

const TONE_STYLES: Record<CardTone, { value: string; surface: string; active: string }> = {
  neutral: {
    value: "text-text",
    surface: "border-border/50 bg-card/40 hover:bg-card/60",
    active: "ring-2 ring-primary/40 border-primary/35 bg-primary/5",
  },
  error: {
    value: "text-danger-ink",
    surface: "border-danger-line/50 bg-danger-surface/50 hover:bg-danger-surface",
    active: "ring-2 ring-danger-line border-danger-line bg-danger-surface",
  },
  warning: {
    value: "text-warning-ink",
    surface: "border-warning-line/50 bg-warning-surface/50 hover:bg-warning-surface",
    active: "ring-2 ring-warning-line border-warning-line bg-warning-surface",
  },
  info: {
    value: "text-info-ink",
    surface: "border-info-line/50 bg-info-surface/50 hover:bg-info-surface",
    active: "ring-2 ring-info-line border-info-line bg-info-surface",
  },
};

export default function SummaryCards({
  summary,
  severityFilter,
  providerFilter,
  findingCounts,
  findingsTotal,
  onFilterChange,
  scanRunning = false,
  progress = null,
}: Props) {
  const liveProgress = scanRunning ? (progress ?? summary.progress ?? null) : null;
  const filesScanned = liveProgress?.filesScanned ?? summary.filesScanned ?? 0;
  const filesInRepo = liveProgress?.filesInRepo ?? summary.filesInRepo ?? 0;

  const counts = resolveFilteredCounts(
    findingCounts,
    providerFilter,
    severityFilter,
    findingsTotal,
    {
      total: summary.totalFindings,
      errors: summary.errors,
      warnings: summary.warnings,
      infos: summary.infos,
    },
  );

  const totalFindings = scanRunning
    ? (liveProgress?.findingsCount ?? counts.total)
    : counts.total;

  const cards: SummaryCard[] = [
    { label: "Files", value: `${filesScanned}/${filesInRepo}`, filter: null, tone: "neutral" },
    { label: "Total", value: totalFindings, filter: "", tone: "neutral" },
    { label: "Errors", value: counts.errors, filter: "error", tone: "error" },
    { label: "Warnings", value: counts.warnings, filter: "warning", tone: "warning" },
    { label: "Info", value: counts.infos, filter: "info", tone: "info" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
      {cards.map((c) => {
        const tone = TONE_STYLES[c.tone];
        const isActive = c.filter !== null && severityFilter === c.filter;
        const isFilesLive = c.label === "Files" && scanRunning;

        return (
          <button
            key={c.label}
            type="button"
            onClick={() => c.filter !== null && onFilterChange(c.filter)}
            className={`${cardCls} px-3 py-2.5 text-left transition-all ${tone.surface} ${
              isActive ? tone.active : ""
            } ${c.filter === null ? "cursor-default pointer-events-none" : "cursor-pointer"} ${
              isFilesLive && !isActive ? "ring-1 ring-primary/30" : ""
            }`}
          >
            <p className={`${typeCaption} font-medium text-text-muted`}>{c.label}</p>
            <p className={`${typeStatValueSm} mt-1 ${tone.value} tabular-nums`}>{c.value}</p>
          </button>
        );
      })}
    </div>
  );
}
