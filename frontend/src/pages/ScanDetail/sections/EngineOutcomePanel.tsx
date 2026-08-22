import { useEffect, useState } from "react";
import { sastApi } from "@/services/api";
import { getErrorMessage } from "@/utils/errors";
import Spinner from "@/components/Spinner";
import { TriangleAlertIcon, XIcon } from "lucide-react";
import type { SastScanState } from "@/types/sast";

/**
 * What the standalone SAST service knows about this scan, which the gateway's
 * own scan record does not carry: which engines actually ran.
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
  regex: "Custom rules",
  sonarqube: "Bearer",
  bearer: "Bearer",
  codeql: "CodeQL",
};

const HIDDEN_ENGINES = new Set(["semgrep"]);

export default function EngineOutcomePanel({
  scanId,
  scanStatus,
}: {
  scanId: string;
  scanStatus?: string;
}) {
  const [state, setState] = useState<SastScanState | null>(null);
  const [loading, setLoading] = useState(CONFIGURED);
  const [error, setError] = useState("");
  const [absent, setAbsent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const terminal = scanStatus === "completed" || scanStatus === "failed";

  useEffect(() => {
    setDismissed(false);
  }, [scanId]);

  useEffect(() => {
    if (!CONFIGURED || !scanId || !terminal) {
      if (!terminal && CONFIGURED) {
        setLoading(false);
        setState(null);
        setError("");
        setAbsent(false);
      }
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError("");
    let done = false;
    sastApi
      .getScan(scanId, ac.signal)
      .then((s) => { done = true; setState(s); setLoading(false); })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        done = true;
        if ((e as { status?: number })?.status === 404) setAbsent(true);
        else setError(getErrorMessage(e));
        setLoading(false);
      });
    return () => { if (!done) ac.abort(); };
  }, [scanId, scanStatus, terminal]);

  if (!CONFIGURED || absent) return null;
  if (!terminal) return null;
  if (loading) {
    return (
      <div className="mt-6 mb-6 flex items-center gap-2 text-sm text-text-muted">
        <Spinner /> Checking engine outcomes…
      </div>
    );
  }
  if (error) {
    return (
      <p className="mt-6 mb-6 text-sm text-text-muted">
        Engine outcomes are unavailable — the SAST service did not respond. {error}
      </p>
    );
  }
  if (!state || dismissed) return null;

  const engines = Object.entries(state.engineStatus ?? {}).filter(([name]) => !HIDDEN_ENGINES.has(name));
  const failedEngines = (state.summary.failedEngines ?? []).filter((e) => !HIDDEN_ENGINES.has(e));
  const partial = Boolean(state.summary.partial && failedEngines.length > 0);

  return (
    <section className="mt-6 mb-6 rounded-card border border-border bg-card" aria-labelledby="engine-outcome-h">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <h2 id="engine-outcome-h" className="text-sm font-semibold text-text">
          Engine outcomes
        </h2>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            aria-label="Dismiss engine outcomes"
            onClick={() => setDismissed(true)}
            className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text"
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* The point of the panel: an engine that failed found nothing, and
          nothing is not the same as clean. */}
      {partial && (
        <div className="flex gap-3 border-b border-border bg-warning-500/5 px-4 py-3">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden />
          <p className="text-sm text-text">
            <span className="font-medium">This scan is incomplete.</span>{" "}
            <span className="text-text-muted">
              {failedEngines.map((e) => ENGINE_LABEL[e] ?? e).join(" and ")} did not
              run, so these results do not rule out what{" "}
              {failedEngines.length > 1 ? "they" : "it"} would have found. No quality
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
    </section>
  );
}
