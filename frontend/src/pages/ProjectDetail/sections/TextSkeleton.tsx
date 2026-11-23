import Skeleton from "@/components/ui/Skeleton";

const WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"];

/** Paragraph-shaped placeholder for markdown that is still loading. */
export default function TextSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${WIDTHS[i % WIDTHS.length]}`} />
      ))}
    </div>
  );
}
