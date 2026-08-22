import { useEffect, useRef, useState } from "react";
import type { ScanProgress } from "@/types";
import { displayFindingPath } from "@/pages/ScanDetail/utils/scanPaths";
import {
  clampProgressPercent,
  finalizeProgressPercent,
  progressDetailLine,
  progressStepLabel,
  rawProgressPercent,
} from "@/pages/ScanDetail/utils/scanProgressPercent";

interface Props {
  progress: ScanProgress;
  /** When false, animate to 100% before the panel unmounts. */
  active?: boolean;
}

export default function ScanProgressPanel({ progress, active = true }: Props) {
  const scanningStartedAt = useRef<number | null>(null);
  const maxPctRef = useRef(0);
  const [displayPct, setDisplayPct] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (progress.phase === "scanning" && scanningStartedAt.current == null) {
      scanningStartedAt.current = Date.now();
    }
    if (progress.phase === "cloning") {
      scanningStartedAt.current = null;
      maxPctRef.current = 0;
    }
  }, [progress.phase]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const elapsed =
        progress.phase === "scanning" && scanningStartedAt.current != null
          ? Date.now() - scanningStartedAt.current
          : 0;

      const target = active
        ? rawProgressPercent(progress, elapsed)
        : 100;

      const next = active
        ? Math.max(maxPctRef.current, clampProgressPercent(target))
        : finalizeProgressPercent(Math.max(maxPctRef.current, target));

      maxPctRef.current = next;
      setDisplayPct(next);

      const rawDetail = progressDetailLine(progress);
      setDetail(rawDetail ? displayFindingPath(rawDetail) : null);

      if (active && progress.phase !== "done") {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [progress, active]);

  const step = progressStepLabel(progress);
  const fileHint =
    progress.filesInRepo > 0
      ? `${Math.min(progress.filesScanned, progress.filesInRepo)}/${progress.filesInRepo} files`
      : null;

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-muted">{step}</span>
        <span className="text-xs font-semibold text-primary tabular-nums">{displayPct}%</span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-linear"
          style={{ width: `${displayPct}%` }}
        />
      </div>

      {(detail || fileHint) && (
        <div className="space-y-0.5">
          {detail && (
            <p key={detail} className="truncate font-mono text-xs/tight text-text-muted">
              {detail}
            </p>
          )}
          {fileHint && (
            <p className="text-xs text-text-muted tabular-nums">{fileHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
