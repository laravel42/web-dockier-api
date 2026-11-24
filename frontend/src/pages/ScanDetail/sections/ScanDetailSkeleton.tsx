import Skeleton from "@/components/ui/Skeleton";
import HistoryRowsSkeleton from "@/components/ui/HistoryRowsSkeleton";
import { cardCls, sidebarPanelHeadCls, sidebarPanelHeadTitleCls } from "@/utils/styles";
import { ChevronLeftIcon } from "lucide-react";
import FindingsSkeleton from "./FindingsSkeleton";
import { PROVIDER_DEFS } from "../utils/providerFilters";

/** Page-shaped placeholder shown while the scan itself loads. Same two columns as the loaded page. */
export default function ScanDetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row" aria-busy="true">
      <div className="min-w-0 flex-1">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ChevronLeftIcon className="size-4" />
          Back to Security Scans
        </button>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          {/* Engine filter tabs (All, Semgrep, Custom rules, SonarQube). */}
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-card/30 p-0.5">
            {PROVIDER_DEFS.map((p) => (
              <Skeleton key={p.key || "all"} className="h-7 w-20" />
            ))}
          </div>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <FindingsSkeleton />
      </div>
      <div className="w-full lg:w-72 lg:shrink-0">
        <div className={`${cardCls} overflow-hidden`}>
          <div className={sidebarPanelHeadCls}>
            <p className={sidebarPanelHeadTitleCls}>History</p>
          </div>
          <HistoryRowsSkeleton />
        </div>
      </div>
    </div>
  );
}
