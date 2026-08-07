import type { ScanProgress } from "@/types";
import { displayFindingPath } from "@/utils/scanPaths";

const SCANNER_LABELS: Record<string, string> = {
  cloning: "Cloning",
  semgrep: "Semgrep",
  custom: "Custom rules",
  sensitive: "Sensitive data",
  sonarqube: "SonarQube",
  persisting: "Saving",
};

const BATCH_SCANNERS = new Set(["semgrep", "sonarqube"]);
const BATCH_SCANNER_ESTIMATE_SEC = 300;

function parseElapsedSeconds(label?: string): number | null {
  if (!label) return null;
  const match = label.match(/\((\d+)m\s*(\d+)s\)$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const secOnly = label.match(/\((\d+)s\)$/);
  if (secOnly) return Number(secOnly[1]);
  return null;
}

function isBatchScannerPhase(progress: ScanProgress): boolean {
  return progress.scanner != null && BATCH_SCANNERS.has(progress.scanner);
}

function progressPercent(progress: ScanProgress): number {
  if (progress.phase === "cloning") return 5;
  if (progress.phase === "persisting") {
    return progress.filesInRepo > 0
      ? 60 + Math.round((progress.filesScanned / progress.filesInRepo) * 35)
      : 85;
  }
  if (progress.phase === "done") return 100;
  if (isBatchScannerPhase(progress)) {
    const elapsed = parseElapsedSeconds(progress.currentFile);
    if (elapsed != null) {
      return Math.min(58, 12 + Math.round((elapsed / BATCH_SCANNER_ESTIMATE_SEC) * 46));
    }
    return 15;
  }
  if (progress.filesInRepo > 0) {
    return 10 + Math.round((progress.filesScanned / progress.filesInRepo) * 50);
  }
  return 30;
}

function stepLabel(progress: ScanProgress): string {
  if (progress.scanner) return SCANNER_LABELS[progress.scanner] ?? progress.scanner;
  if (progress.phase === "cloning") return "Cloning";
  if (progress.phase === "persisting") return "Saving";
  return "Scanning";
}

function detailLine(progress: ScanProgress): string | null {
  if (progress.currentRule && progress.rulesTotal != null && progress.rulesTotal > 0) {
    const rule = progress.currentRule;
    const checked = progress.rulesChecked ?? 0;
    return `${rule} (${checked}/${progress.rulesTotal})`;
  }
  const current = progress.currentFile ?? null;
  if (!current) return null;
  return displayFindingPath(current);
}

export default function ScanProgressPanel({ progress }: { progress: ScanProgress }) {
  const pct = progressPercent(progress);
  const batchScanner = isBatchScannerPhase(progress);
  const detail = detailLine(progress);

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-text-muted">{stepLabel(progress)}</span>
        <span className="text-[10px] font-semibold text-primary tabular-nums">{pct}%</span>
      </div>

      <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full bg-primary ease-out ${batchScanner ? "animate-pulse" : ""} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {detail && (
        <p key={detail} className="truncate font-mono text-[9px] leading-tight text-text-muted">
          {detail}
        </p>
      )}
    </div>
  );
}
