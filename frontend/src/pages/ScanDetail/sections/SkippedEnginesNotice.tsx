import { TriangleAlertIcon } from "lucide-react";
import type { SkippedEngine } from "@/types";
import { PROVIDER_DEFS } from "../utils/providerFilters";

/**
 * Says so when a scan finished without one of its engines. The scan status is
 * a closed enum with no "degraded", so without this a stopped SonarQube looks
 * exactly like a clean repository: "completed", zero findings.
 */
export default function SkippedEnginesNotice({ engines }: { engines: SkippedEngine[] }) {
  if (engines.length === 0) return null;
  const label = (key: string) => PROVIDER_DEFS.find((p) => p.key === key)?.label ?? key;

  return (
    <div
      role="status"
      className="mb-4 flex gap-3 rounded-card border border-warning-500/30 bg-warning-500/5 px-4 py-3"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-text">This scan is incomplete.</p>
        <ul className="mt-1 space-y-0.5 text-text-muted">
          {engines.map((e) => (
            <li key={e.engine}>
              {label(e.engine)} {e.reason}.
            </li>
          ))}
        </ul>
        <p className="mt-1 text-text-muted">
          Its results are missing, not empty. Run the scan again; if this keeps happening, contact your
          administrator.
        </p>
      </div>
    </div>
  );
}
