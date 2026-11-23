import Skeleton from "@/components/ui/Skeleton";
import { cardCls, sidebarPanelHeadCls, sidebarPanelHeadTitleCls } from "@/utils/styles";
import { ChevronLeftIcon } from "lucide-react";
import HistoryRowsSkeleton from "@/components/ui/HistoryRowsSkeleton";

const logLines = ["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3", "w-5/6", "w-3/4", "w-full"];

/** Page-shaped placeholder shown while the deployment itself loads. Same two columns as the loaded page. */
export default function DeployDetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex gap-6" aria-busy="true">
      <div className="min-w-0 flex-1">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ChevronLeftIcon className="size-4" />
          Back to Project
        </button>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="mb-6 grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <div className={`${cardCls} overflow-hidden`}>
          <div className="border-b border-border px-4 py-2.5">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-2.5 p-4">
            {logLines.map((w, i) => (
              <Skeleton key={i} className={`h-3.5 ${w}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="w-72 shrink-0">
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
