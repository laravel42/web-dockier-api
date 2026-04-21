import type { RepoStats } from "../types";
import { cardCls, langColors, getKpiCards } from "../constants";

interface Props {
  stats: RepoStats | null;
  statsLoading: boolean;
  statsError: string;
}

export default function KpiDashboard({ stats, statsLoading, statsError }: Props) {
  if (statsLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Repository KPIs</h2>
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Repository KPIs</h2>
        <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-4 py-3 text-sm text-danger-500">{statsError}</div>
      </div>
    );
  }

  if (!stats) return null;

  const kpiCards = getKpiCards(stats);

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Repository KPIs</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className={`${cardCls} p-4 text-center`}>
            <div className="flex justify-center text-primary-500 mb-2">{kpi.icon}</div>
            <p className="text-xl font-bold text-text">{typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}</p>
            <p className="text-xs text-text-muted mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>
      {/* Languages breakdown */}
      {stats.languages && Object.keys(stats.languages).length > 0 && (() => {
        const langs = Object.entries(stats.languages)
          .filter(([, pct]) => pct >= 0.1)
          .sort(([, a], [, b]) => b - a);
        return (
        <div className={`${cardCls} p-4 mt-3`}>
          <p className="text-xs text-text-muted mb-3">Languages</p>
          <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
            {langs.map(([lang, pct], i) => (
                <div
                  key={lang}
                  className={`${langColors[i % langColors.length]}`}
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                  title={`${lang}: ${pct}%`}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {langs.map(([lang, pct], i) => (
                <div key={lang} className="flex items-center gap-1.5 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${langColors[i % langColors.length]}`} />
                  <span className="text-text-secondary">{lang}</span>
                  <span className="text-text-muted">{pct < 1 ? `<1` : Math.round(pct)}%</span>
                </div>
              ))}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
