import Skeleton from "@/components/ui/Skeleton";
import { settingsCardCls, settingsCardGridCls } from "@/utils/styles";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Settings tab pills while the permissions that decide which tabs exist are still loading. */
export function SettingsTabsSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap gap-2" aria-busy="true">
      {["w-16", "w-20", "w-24", "w-20", "w-28"].map((w, i) => (
        <Skeleton key={i} className={`h-9 ${w}`} />
      ))}
    </div>
  );
}

/** Card grid of the list tabs (Users, Roles, Providers, SSH Keys, Source Control, Channels). */
export function SettingsCardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={settingsCardGridCls} aria-busy="true">
      {range(count).map((i) => (
        <div key={i} className={`${settingsCardCls} space-y-3`}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Labelled-field rows inside an already rendered form card. */
export function FormFieldsSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true">
      {range(fields).map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

/** The Profile tab: two form cards side by side. */
export function SettingsFormCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2" aria-busy="true">
      {range(2).map((i) => (
        <div key={i} className="rounded-card bg-card p-6 shadow-(--shadow-card)">
          <Skeleton className="mb-2 h-5 w-32" />
          <Skeleton className="mb-5 h-4 w-64" />
          <FormFieldsSkeleton />
        </div>
      ))}
    </div>
  );
}

/** Rule cards of the Security Tools panels, with the filter sidebar when `sidebar` is set. */
export function RuleCardsSkeleton({ sidebar = false }: { sidebar?: boolean }) {
  const cards = (
    <div className="grid grid-cols-2 gap-2" aria-busy="true">
      {range(8).map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2.5 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
  if (!sidebar) return cards;
  return (
    <div className="flex gap-4">
      <div className="hidden shrink-0 space-y-1.5 md:block md:w-52">
        <Skeleton className="h-40" />
        <Skeleton className="h-52" />
      </div>
      <div className="min-w-0 flex-1">{cards}</div>
    </div>
  );
}
