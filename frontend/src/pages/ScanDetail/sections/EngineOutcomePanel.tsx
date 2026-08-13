import { useEffect, useState } from "react";
import { sastApi } from "@/services/api";
import { getErrorMessage } from "@/utils/errors";
import Spinner from "@/components/Spinner";
import { TriangleAlertIcon, ChevronDownIcon, EyeOffIcon } from "lucide-react";
import type { SastFinding, SastScanState } from "@/types/sast";

/**
 * What the standalone SAST service knows about this scan, which the gateway's
 * own scan record does not carry: which engines actually ran, and which findings
 * the LLM filter suppressed.
 *
 * Strictly read-only. It is additive to a page that already works, so:
 *  - with no `VITE_SAST_API_BASE` configured the panel renders nothing at all
 *    rather than advertising a capability this deployment does not have;
 *  - a scan the service has never seen (404) is normal, not an error — the
 *    gateway scanner may have produced it — and also renders nothing;
 *  - any other failure degrades to one quiet line, never a broken page.
 */

// Vite reads .env at startup, so a variable added to a running dev server is
// absent until it restarts. Rendering nothing is right here either way: this
// panel is additive to a page that already works.
const CONFIGURED = Boolean(import.meta.env.VITE_SAST_API_BASE);

const ENGINE_LABEL: Record<string, string> = {
  semgrep: "Semgrep",
  regex: "Custom rules",
  sonarqube: "SonarQube",
  codeql: "CodeQL",
};

export default function EngineOutcomePanel({ scanId }: { scanId: string }) {
  const [state, setState] = useState<SastScanState | null>(null);
  const [suppressed, setSuppressed] = useState<SastFinding[] | null>(null);
  const [suppressedOpen, setSuppressedOpen] = useState(false);
  const [loading, setLoading] = useState(CONFIGURED);
  const [error, setError] = useState("");
  const [absent, setAbsent] = useState(false);

  useEffect(() => {
    if (!CONFIGURED || !scanId) return;
    const ac = new AbortController();
    setLoading(true);
    sastApi
      .getScan(scanId, ac.signal)
      .then(setState)
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        // The service not knowing this scan is an ordinary outcome.
        if ((e as { status?: number })?.status === 404) setAbsent(true);
        else setError(getErrorMessage(e));
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [scanId]);

  const loadSuppressed = async () => {
    setSuppressedOpen((o) => !o);
    if (suppressed) return;
    try {
      const page = await sastApi.listFindings(scanId, { includeSuppressed: true, limit: 200 });
      setSuppressed(page.findings.filter((f) => f.suppressedByLlm));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  if (!CONFIGURED || absent) return null;
  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-text-muted">
        <Spinner /> Checking engine outcomes…
      </div>
    );
  }
  if (error) {
    return (
      <p className="mt-6 text-sm text-text-muted">
        Engine outcomes are unavailable — the SAST service did not respond. {error}
      </p>
    );
  }
  if (!state) return null;

  const engines = Object.entries(state.engineStatus ?? {});

  return (
    <section className="mt-6 rounded-card border border-border bg-card" aria-labelledby="engine-outcome-h">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <h2 id="engine-outcome-h" className="text-sm font-semibold text-text">
          Engine outcomes
        </h2>
        {state.qualityGateStatus && (
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              state.qualityGateStatus === "passed"
                ? "bg-success-500/10 text-success-500"
                : "bg-danger-500/10 text-danger-500"
            }`}
          >
            Quality gate {state.qualityGateStatus}
          </span>
        )}
      </div>

      {/* The point of the panel: an engine that failed found nothing, and
          nothing is not the same as clean. */}
      {state.summary.partial && (
        <div className="flex gap-3 border-b border-border bg-warning-500/5 px-4 py-3">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden />
          <p className="text-sm text-text">
            <span className="font-medium">This scan is incomplete.</span>{" "}
            <span className="text-text-muted">
              {state.summary.failedEngines.map((e) => ENGINE_LABEL[e] ?? e).join(" and ")} did not
              run, so these results do not rule out what{" "}
              {state.summary.failedEngines.length > 1 ? "they" : "it"} would have found. No quality
              gate verdict is issued for an incomplete scan.
            </span>
          </p>
        </div>
      )}

      <ul className="divide-y divide-border">
        {engines.map(([name, s]) => (
          <li key={name} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-sm text-text">{ENGINE_LABEL[name] ?? name}</span>
            {s.status === "ok" ? (
              <span className="text-xs font-medium text-success-500">completed</span>
            ) : (
              <span className="text-right text-xs">
                <span className="font-medium text-danger-500">failed</span>
                {s.error && <span className="ml-2 text-text-muted">{s.error}</span>}
              </span>
            )}
          </li>
        ))}
        {engines.length === 0 && (
          <li className="px-4 py-3 text-sm text-text-muted">
            No engine has reported for this scan yet.
          </li>
        )}
      </ul>

      {/* Suppression is a marked state, not a deletion — this is where a
          reviewer audits what the filter removed. */}
      <div className="border-t border-border">
        <button
          type="button"
          onClick={loadSuppressed}
          aria-expanded={suppressedOpen}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-text-muted hover:text-text"
        >
          <EyeOffIcon className="size-4" aria-hidden />
          Findings the AI filter suppressed
          <ChevronDownIcon
            className={`ml-auto size-4 transition-transform ${suppressedOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {suppressedOpen && (
          <div className="border-t border-border px-4 py-3">
            {suppressed === null ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Spinner /> Loading…
              </div>
            ) : suppressed.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nothing was suppressed on this scan.
              </p>
            ) : (
              <ul className="space-y-3">
                {suppressed.map((f) => (
                  <li key={f.id} className="text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <code className="text-xs text-text">{f.ruleId}</code>
                      <span className="text-xs text-text-muted">
                        {f.filePath}:{f.startLine}
                      </span>
                    </div>
                    <p className="mt-0.5 text-text-muted">{f.message}</p>
                    {f.suppressionReason && (
                      <p className="mt-0.5 text-xs text-text-muted italic">
                        Suppressed because: {f.suppressionReason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
