import type { ScanProgress } from "@/types";

/** Inclusive phase bands on the 0–100 bar (must be monotonic). */
const PHASE_FLOOR: Record<string, number> = {
  cloning: 0,
  scanning: 12,
  persisting: 84,
  done: 100,
};

const PHASE_CEIL: Record<string, number> = {
  cloning: 12,
  scanning: 84,
  persisting: 99,
  done: 100,
};

/** When engines run in parallel without per-file updates, creep toward this fraction of the scanning band. */
const SCANNING_TIME_CREEP_MAX = 0.55;
const SCANNING_ESTIMATE_MS = 180_000;

export function rawProgressPercent(progress: ScanProgress, elapsedScanningMs = 0): number {
  const phase = progress.phase || "scanning";
  const floor = PHASE_FLOOR[phase] ?? 0;
  const ceil = PHASE_CEIL[phase] ?? 100;

  if (phase === "done") return 100;

  if (phase === "cloning") {
    return floor + 4;
  }

  if (phase === "persisting") {
    if (progress.filesInRepo > 0) {
      const ratio = Math.min(1, progress.filesScanned / progress.filesInRepo);
      return floor + ratio * (ceil - floor);
    }
    return floor + (ceil - floor) * 0.5;
  }

  if (phase === "scanning") {
    const span = ceil - floor;
    if (progress.filesInRepo > 0 && progress.filesScanned > 0) {
      const ratio = Math.min(1, progress.filesScanned / progress.filesInRepo);
      return floor + ratio * span;
    }
    const timeRatio = Math.min(1, elapsedScanningMs / SCANNING_ESTIMATE_MS);
    return floor + timeRatio * span * SCANNING_TIME_CREEP_MAX;
  }

  return floor;
}

export function clampProgressPercent(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

export function finalizeProgressPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const SCANNER_LABELS: Record<string, string> = {
  cloning: "Cloning repository",
  scanning: "Running security engines",
  semgrep: "Semgrep",
  custom: "Custom rules",
  regex: "Custom rules",
  sensitive: "Sensitive data",
  bearer: "Bearer",
  sonarqube: "Bearer",
  codeql: "CodeQL",
  persisting: "Saving results",
};

export function progressStepLabel(progress: ScanProgress): string {
  if (progress.scanner) {
    return SCANNER_LABELS[progress.scanner] ?? progress.scanner;
  }
  if (progress.phase === "cloning") return SCANNER_LABELS.cloning;
  if (progress.phase === "persisting") return SCANNER_LABELS.persisting;
  if (progress.phase === "done") return "Complete";
  return SCANNER_LABELS.scanning;
}

export function progressDetailLine(progress: ScanProgress): string | null {
  if (progress.currentRule && progress.rulesTotal != null && progress.rulesTotal > 0) {
    const checked = progress.rulesChecked ?? 0;
    return `${progress.currentRule} (${checked}/${progress.rulesTotal})`;
  }
  const current = progress.currentFile?.trim();
  if (!current) return null;
  return current;
}
