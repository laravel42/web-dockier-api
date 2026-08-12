import { CalendarBlank, Clock } from "@/components/icons/lucide-icons";
import { StatRow } from "@/components/projects/StatRow";
import type { TimeSummary } from "@/lib/data/project-details";

type TimeCardProps = {
  time: TimeSummary;
};

export function TimeCard({ time }: TimeCardProps) {
  return (
    <section className="py-6">
      <div className="pb-5">
        <div className="text-sm font-semibold">Schedule</div>
      </div>
      <div className="space-y-5">
        <StatRow
          label="Estimate"
          value={<span className="px-2">{time.estimateLabel}</span>}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatRow
          label="Due Date"
          value={
            <span className="px-2">
              {time.dueDate.toLocaleDateString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          }
          icon={<CalendarBlank className="h-4 w-4" />}
        />
      </div>
    </section>
  );
}
