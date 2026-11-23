import Skeleton from "@/components/ui/Skeleton";
import { cardCls } from "@/utils/styles";

/** Card of placeholder rows for a project-detail panel whose list is still loading. */
export default function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={`${cardCls} divide-y divide-border/40`} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  );
}
