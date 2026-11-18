import { scanStatusDot } from "@/utils/scanSummary";
import type { ScanSummary } from "@/types";

/**
 * The colored status dot of a scan, with its meaning as text for screen readers
 * and as a tooltip, so status is never color-only. See `scanStatusDot`.
 */
export default function ScanStatusDot({ status, summary, findings, className = "size-2" }: {
  status: string;
  summary?: ScanSummary | null;
  /** Summary whose counts color a completed scan; defaults to `summary`. */
  findings?: ScanSummary | null;
  className?: string;
}) {
  const dot = scanStatusDot(status, summary, findings === undefined ? summary : findings);
  return <span role="img" aria-label={dot.label} title={dot.label} className={`${className} shrink-0 rounded-full ${dot.className}`} />;
}
