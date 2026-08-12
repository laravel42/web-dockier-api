import type { RepoStats } from "@/types";
import { getKpiCards } from "../constants";
import Spinner from "@/components/Spinner";

interface Props {
  stats: RepoStats | null;
  statsLoading: boolean;
  statsError: string;
  embedded?: boolean;
}

/**
 * Persistent repository readout — one container with a hairline lattice instead
 * of six competing surfaces.
 *
 * Values lead: the figure is the dominant mark and its label sits beneath it, so
 * the counts that carry signal read before the ones merely present. Zero and
 * no-data cells hold back to 70% so a wall of zeros never competes with the
 * numbers that actually moved.
 */
export default function ProjectStatsStrip({ stats, statsLoading, statsError, embedded = false }: Props) {
  const outerCls = embedded ? "" : "mb-6";

  if (statsLoading) {
    return (
      <div className={`${outerCls} flex h-12 items-center justify-center rounded-lg border border-border/60 bg-card/40`}>
        <Spinner />
      </div>
    );
  }

  if (statsError) {
    return (
      <div className={`${outerCls} rounded-lg border border-border/60 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-500`}>
        {statsError}
      </div>
    );
  }

  if (!stats) return null;

  const kpis = getKpiCards(stats);

  return (
    <div className={outerCls}>
      {/* gap-px over a border-toned background paints the dividers, so the lattice
          survives wrapping at every column count without per-cell border rules. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const isQuiet = typeof kpi.value === "number" ? kpi.value === 0 : true;
          return (
            <div key={kpi.label} className="flex flex-col items-center gap-0.5 bg-card px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="shrink-0">{kpi.icon}</span>
                <span
                  className={`text-xl font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums text-text${
                    isQuiet ? " opacity-70" : ""
                  }`}
                >
                  {typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}
                </span>
              </div>
              <span className="w-full truncate text-center text-xs leading-[1.3] text-text-muted">{kpi.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
