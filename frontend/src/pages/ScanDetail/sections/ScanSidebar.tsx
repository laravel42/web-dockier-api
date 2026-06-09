import SeverityBadge from "../../../components/SeverityBadge";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import {
  btnPrimary,
  cardCls,
  getStatusDotClass,
  sidebarHistoryItemCls,
  sidebarHistoryLabelCls,
  sidebarPanelHeadCls,
  sidebarPanelHeadTitleCls,
} from "../../../utils/styles";
import { usePermissions } from "../../../context/PermissionsContext";
import type { Scan, ScanProgress } from "../../../types";
import Spinner from "../../../components/Spinner";
import ScanProgressPanel from "./ScanProgressPanel";
import GitBranchIcon from "../../../components/icons/outlined/GitBranchIcon";

interface Props {
  scanId: string | undefined;
  allScans: Scan[];
  allScansLoading: boolean;
  scanRunning: boolean;
  scanProgress: ScanProgress | null;
  scanError: string;
  hasConnectionId: boolean;
  onRunScan: () => void;
  onSelectScan: (id: string) => void;
}

export default function ScanSidebar({
  scanId, allScans, allScansLoading,
  scanRunning, scanProgress, scanError,
  hasConnectionId, onRunScan, onSelectScan,
}: Props) {
  const { has, isOwner, loading: permissionsLoading } = usePermissions();
  const canRunScan = isOwner || has("scan:run");

  return (
    <div className="w-72 shrink-0">
      <div className="sticky top-6 space-y-2">
        <div className={`${cardCls} overflow-hidden`}>
          <div className="p-2 border-b border-border/40">
            <button
              type="button"
              onClick={onRunScan}
              disabled={!hasConnectionId || permissionsLoading || !canRunScan}
              className={`${btnPrimary} w-full py-2 text-sm`}
            >
              <ShieldCheckIcon className="size-3.5" />
              Run new scan
            </button>
          </div>

          {scanRunning && scanProgress && (
            <div className="px-2.5 py-2 border-b border-border/40 bg-muted/15">
              <ScanProgressPanel progress={scanProgress} />
            </div>
          )}

          {scanError && (
            <div className="px-2.5 py-2 border-b border-danger-500/20 bg-danger-500/5 text-[10px] leading-snug text-danger-500">
              {scanError}
            </div>
          )}

          <div className={sidebarPanelHeadCls}>
            <p className={sidebarPanelHeadTitleCls}>History</p>
          </div>

          {allScansLoading ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-3.5" />
            </div>
          ) : allScans.length === 0 ? (
            <p className="text-[10px] text-text-muted text-center py-3">No scans yet</p>
          ) : (
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto divide-y divide-border/40">
              {allScans.map((s) => {
                const isActive = s.id === scanId;
                const isLive = s.status === "running" || s.status === "pending";
                const hasBadges = s.summary && (s.summary.errors > 0 || s.summary.warnings > 0 || s.summary.infos > 0);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectScan(s.id)}
                    className={`${sidebarHistoryItemCls(isActive)} w-full px-2.5 py-2 text-left`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`size-2 rounded-full shrink-0 ${getStatusDotClass(s.status)}`} />
                      <span className={`${sidebarHistoryLabelCls(isActive)} truncate`}>
                        {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isLive && (
                        <span className="ml-auto shrink-0 text-[9px] font-medium text-primary">live</span>
                      )}
                    </div>
                    <div className="mt-1 ml-3.5 flex items-center gap-1.5 min-w-0 text-[10px]">
                      <GitBranchIcon className="size-3 shrink-0 text-text-muted" />
                      <span className="truncate font-mono text-text-secondary">{s.branch}</span>
                      {s.commitSha && (
                        <span className="shrink-0 font-mono text-text-muted">{s.commitSha.slice(0, 7)}</span>
                      )}
                    </div>
                    {hasBadges && (
                      <div className="mt-1 ml-3.5 flex flex-wrap items-center gap-1">
                        {s.summary!.errors > 0 && <SeverityBadge severity="error" count={s.summary!.errors} />}
                        {s.summary!.warnings > 0 && <SeverityBadge severity="warning" count={s.summary!.warnings} />}
                        {s.summary!.infos > 0 && <SeverityBadge severity="info" count={s.summary!.infos} />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
