import Skeleton from "@/components/ui/Skeleton";
import { cardCls } from "@/utils/styles";

/** Collapsed file groups, as FindingsList renders them, while the first page of findings loads. */
export default function FindingsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`${cardCls} flex items-center gap-2 px-3 py-2.5`}>
          <Skeleton className="size-3.5 shrink-0" />
          <Skeleton className="h-3.5 w-1/2" />
          <div className="ml-auto flex gap-1">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
