import SeverityBadge from "@/components/SeverityBadge";
import {
  cardCls,
  sidebarHistoryItemCls,
  sidebarHistoryLabelCls,
  sidebarPanelHeadCls,
  sidebarPanelHeadTitleCls,
} from "@/utils/styles";
import { usePermissions } from "@/context/PermissionsContext";
import type { Scan } from "@/types";
import Button from "@/components/ui/Button";
import Spinner from "@/components/Spinner";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { ShieldCheckIcon, Trash2Icon } from "lucide-react";
import ScanStatusDot from "@/components/ScanStatusDot";
import { clickableProps } from "@/utils/a11y";

interface Props {
  scanId: string | undefined;
  allScans: Scan[];
  allScansLoading: boolean;
  scanError: string;
  /** The selected scan ended because a user cancelled it. */
  scanCancelled?: boolean;
  scanRunning?: boolean;
  cancelling?: boolean;
  /** Absent where there is no scan to cancel (the empty state). */
  onCancelScan?: () => void;
  /** Absent where there is no scan to delete (the empty state). */
  onDeleteScan?: () => void;
  hasConnectionId: boolean;
  onRunScan: () => void;
  onSelectScan: (id: string) => void;
  runScanBusy?: boolean;
}

export default function ScanSidebar({
  scanId, allScans, allScansLoading,
  scanError, scanCancelled = false, scanRunning = false, cancelling = false, onCancelScan, onDeleteScan,
  hasConnectionId, onRunScan, onSelectScan, runScanBusy = false,
}: Props) {
  const { has, isOwner, loading: permissionsLoading } = usePermissions();
  const canRunScan = isOwner || has("scan:run");
  // The delete route requires scan:manage, not scan:run.
  const canManageScans = isOwner || has("scan:manage");

  return (
    <div className="w-72 shrink-0">
      <div className="sticky top-6 space-y-2">
        <div className={`${cardCls} overflow-hidden`}>
          <div className="p-2 border-b border-border/40">
            <Button
              type="button"
              onClick={onRunScan}
              loading={runScanBusy}
              disabled={!hasConnectionId || permissionsLoading || !canRunScan || runScanBusy}
              iconLeft={<ShieldCheckIcon className="size-3.5" />}
              className="w-full"
            >
              Run new scan
            </Button>
            {scanRunning && canRunScan && onCancelScan && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancelScan}
                disabled={cancelling}
                loading={cancelling}
                className="mt-2 w-full"
              >
                {cancelling ? "Cancelling…" : "Cancel scan"}
              </Button>
            )}
            {/* Not while it runs: the backend refuses, a running scan has to be cancelled first. */}
            {!scanRunning && canManageScans && onDeleteScan && (
              <Button
                type="button"
                variant="ghost"
                onClick={onDeleteScan}
                iconLeft={<Trash2Icon className="size-3.5" />}
                className="mt-2 w-full text-text-muted hover:text-danger-500"
              >
                Delete scan
              </Button>
            )}
          </div>
          {scanCancelled && !scanError && (
            <div className="px-2.5 py-2 border-b border-border/40 text-xs/snug text-text-muted">
              This scan was cancelled. Its results were discarded.
            </div>
          )}

          {scanError && (
            <div className="px-2.5 py-2 border-b border-danger-500/20 bg-danger-500/5 text-xs/snug  text-danger-500">
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
            <p className="text-xs text-text-muted text-center py-3">No scans yet</p>
          ) : (
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto divide-y divide-border/40">
              {allScans.map((s) => {
                const isActive = s.id === scanId;
                const isLive = s.status === "running" || s.status === "pending";
                const hasBadges = s.summary && (s.summary.errors > 0 || s.summary.warnings > 0 || s.summary.infos > 0);
                return (
                  <div
                    key={s.id}
                    {...clickableProps(() => onSelectScan(s.id))}
                    className={`${sidebarHistoryItemCls(isActive)} w-full px-2.5 py-2 text-left`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ScanStatusDot status={s.status} summary={s.summary} />
                      <span className={`${sidebarHistoryLabelCls(isActive)} truncate min-w-0`}>
                        {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
                        {isLive && (
                          <span className="text-xs font-medium text-primary">live</span>
                        )}
                        <BranchCommitLabel branch={s.branch} />
                      </div>
                    </div>
                    {hasBadges && (
                      <div className="mt-1.5 ml-3.5 flex flex-wrap items-center gap-1">
                        {s.summary!.errors > 0 && <SeverityBadge severity="error" count={s.summary!.errors} size="compact" />}
                        {s.summary!.warnings > 0 && <SeverityBadge severity="warning" count={s.summary!.warnings} size="compact" />}
                        {s.summary!.infos > 0 && <SeverityBadge severity="info" count={s.summary!.infos} size="compact" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
