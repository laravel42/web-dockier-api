import Skeleton from "@/components/ui/Skeleton";

/** Placeholder rows shaped like a notification: title and time on one line, body below. */
export default function NotificationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/40" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
