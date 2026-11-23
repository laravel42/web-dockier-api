import Skeleton from "@/components/ui/Skeleton";

/** Placeholder rows for the History sidebar while the deployment list loads. */
export default function HistoryRowsSkeleton() {
  return (
    <div className="divide-y divide-border/40" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2 px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-2 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="ml-3.5 flex items-center gap-1.5">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
