import { useState } from "react";
import type { AIAnalysis } from "../../../components/DeployWizard/types";
import { cardCls } from "../../../utils/styles";
import SensitivityBadge, { getSensitivityStyle } from "../../../components/badges/SensitivityBadge";

interface Props {
  dataFlow: NonNullable<AIAnalysis["dataFlow"]>;
}

export default function DataFlowDiagram({ dataFlow }: Props) {
  const entities = (dataFlow.entities || []).filter(e => e.fields?.length > 0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

  if (!entities.length) return null;

  const totalFields = entities.reduce((sum, e) => sum + e.fields.length, 0);
  const sensitivityCounts = entities.flatMap(e => e.fields || []).reduce((acc, f) => {
    acc[f.sensitivity] = (acc[f.sensitivity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggle = (i: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });

  return (
    <div className={`${cardCls} mb-6 overflow-hidden`}>
      <div className="h-1 bg-linear-to-r from-amber-500 via-orange-400 to-rose-400" />
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-7  rounded-md bg-amber-100 flex items-center justify-center">
              <svg className="size-4  text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">Collected Data</h2>
              <p className="text-[11px] text-text-muted">{entities.length} entities · {totalFields} fields</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            {Object.entries(sensitivityCounts).sort(([a], [b]) => {
              const order = ["public", "internal", "personal", "sensitive", "secret"];
              return order.indexOf(a) - order.indexOf(b);
            }).map(([key, count]) => {
              const s = getSensitivityStyle(key);
              return (
                <span key={key} className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                  {s.label} ({count})
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          {entities.map((entity, i) => {
            const isOpen = expanded.has(i);
            return (
              <div key={i} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(i)}
                  className="w-full bg-secondary-50 px-3 py-2 flex items-center justify-between text-left hover:bg-secondary-100 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-text">{entity.name}</h3>
                      <span className="text-[10px] text-text-muted bg-card border border-border px-1.5 py-0.5 rounded-full shrink-0">{entity.storage}</span>
                      <span className="text-[10px] text-text-muted">{entity.fields?.length || 0} fields</span>
                    </div>
                  </div>
                  <svg className={`size-3.5  text-text-muted shrink-0 ml-3 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isOpen && entity.fields?.length > 0 && (
                  <div className="divide-y divide-border">
                    {entity.fields.map((field, j) => (
                        <div key={j} className="flex items-center px-3 py-1.5 gap-3 hover:bg-secondary-50/50 transition-colors">
                          <span className="text-xs font-mono text-text w-1/3 truncate" title={field.name}>{field.name}</span>
                          <span className="text-[11px] text-text-muted w-1/4 truncate">{field.type}</span>
                          <span className="ml-auto"><SensitivityBadge level={field.sensitivity} /></span>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
