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
import GitBranchIcon from "../../../components/icons/outlined/GitBranchIcon";
import GitCommitIcon from "../../../components/icons/outlined/GitCommitIcon";

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
  const { has } = usePermissions();
  const canScan = has("scan:run");

  return (
    <div className="w-80 shrink-0">
      <div className="sticky top-6 space-y-3">
        {canScan && (
          <button
            type="button"
            onClick={onRunScan}
            disabled={scanRunning || !hasConnectionId}
            className={`${btnPrimary} w-full`}
          >
            {scanRunning ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Scanning…
              </>
            ) : (
              <>
                <ShieldCheckIcon className="size-4" />
                Run new scan
              </>
            )}
          </button>
        )}

        {scanRunning && scanProgress && (() => {
          const pct = scanProgress.phase === "cloning" ? 5
            : scanProgress.phase === "scanning" ? (scanProgress.filesInRepo > 0 ? 10 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 50) : 30)
            : scanProgress.phase === "persisting" ? (scanProgress.filesInRepo > 0 ? 60 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 35) : 80)
            : 100;
          const label = scanProgress.phase === "cloning" ? "Cloning repository…"
            : scanProgress.phase === "scanning" ? "Running security scanners…"
            : scanProgress.phase === "persisting" ? "Processing findings…"
            : "Finalizing…";
          return (
            <div className={`${cardCls} space-y-2 p-3`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-text">{label}</p>
                <span className="text-xs font-semibold text-primary">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-text-muted">
                <span>{scanProgress.filesScanned > 0 ? `${scanProgress.filesScanned}/${scanProgress.filesInRepo} files` : ""}</span>
                <span>{scanProgress.findingsCount > 0 ? `${scanProgress.findingsCount} findings` : ""}</span>
              </div>
              {scanProgress.currentFile && (
                <p className="truncate font-mono text-[10px] text-text-muted">{scanProgress.currentFile}</p>
              )}
            </div>
          );
        })()}

        {scanError && (
          <div className="rounded-lg border border-danger-500/20 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">
            {scanError}
          </div>
        )}

        <div className={`${cardCls} overflow-hidden`}>
          <div className={sidebarPanelHeadCls}>
            <p className={sidebarPanelHeadTitleCls}>Scan History</p>
          </div>
          {allScansLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4" />
            </div>
          ) : allScans.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No scans yet</p>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-border/50">
              {allScans.map((s) => {
                const isActive = s.id === scanId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectScan(s.id)}
                    className={`${sidebarHistoryItemCls(isActive)} p-3`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full shrink-0 ${getStatusDotClass(s.status)}`} />
                      <span className={sidebarHistoryLabelCls(isActive)}>
                        {new Date(s.createdAt).toLocaleDateString()}{" "}
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="mt-1.5 ml-4.5 flex items-center gap-2">
                      <GitBranchIcon className="size-3.5 shrink-0 text-text-muted" />
                      <span className="truncate font-mono text-xs font-medium text-text">{s.branch}</span>
                    </div>
                    {s.commitSha && (
                      <div className="mt-1 ml-4.5 flex items-center gap-2">
                        <GitCommitIcon className="size-3.5 shrink-0 text-text-muted" />
                        <span className="font-mono text-xs font-medium text-text">{s.commitSha.slice(0, 7)}</span>
                        {s.commitMessage && (
                          <span className="truncate text-xs text-text-muted">{s.commitMessage.split("\n")[0]}</span>
                        )}
                      </div>
                    )}
                    {s.summary && (s.summary.errors > 0 || s.summary.warnings > 0 || s.summary.infos > 0) && (
                      <div className="mt-1.5 ml-4.5 flex flex-wrap items-center gap-1.5">
                        {s.summary.errors > 0 && <SeverityBadge severity="error" count={s.summary.errors} />}
                        {s.summary.warnings > 0 && <SeverityBadge severity="warning" count={s.summary.warnings} />}
                        {s.summary.infos > 0 && <SeverityBadge severity="info" count={s.summary.infos} />}
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
