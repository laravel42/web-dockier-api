import SeverityBadge from "@/components/SeverityBadge";
import {
  cardCls,
  getStatusDotClass,
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
import { ShieldCheckIcon } from "lucide-react";
import { scanFindingSeverityDotClass } from "@/utils/scanSummary";

interface Props {
  scanId: string | undefined;
  allScans: Scan[];
  allScansLoading: boolean;
  scanError: string;
  hasConnectionId: boolean;
  onRunScan: () => void;
  onSelectScan: (id: string) => void;
  runScanBusy?: boolean;
}

export default function ScanSidebar({
  scanId, allScans, allScansLoading,
  scanError,
  hasConnectionId, onRunScan, onSelectScan, runScanBusy = false,
}: Props) {
  const { has, isOwner, loading: permissionsLoading } = usePermissions();
  const canRunScan = isOwner || has("scan:run");

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
          </div>

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
                const dotClass = isLive
                  ? getStatusDotClass(s.status)
                  : s.status === "failed"
                    ? getStatusDotClass("failed")
                    : scanFindingSeverityDotClass(s.summary);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectScan(s.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectScan(s.id);
                      }
                    }}
                    className={`${sidebarHistoryItemCls(isActive)} w-full px-2.5 py-2 text-left`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`size-2 rounded-full shrink-0 ${dotClass}`} />
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
