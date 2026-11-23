import Skeleton from "@/components/ui/Skeleton";
import { cardCls } from "@/utils/styles";
import PanelSkeleton from "./PanelSkeleton";

/** Page-shaped placeholder shown while the project itself loads. The back button is rendered by the page. */
export default function ProjectDetailSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-12 shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className={`${cardCls} mb-6 grid gap-4 p-4 sm:grid-cols-2`}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-12 shrink-0" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
      <PanelSkeleton rows={4} />
    </div>
  );
}
