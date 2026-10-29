/**
 * Compose deploy configuration: which file to run, and which of its services
 * gets the domain.
 *
 * Both are choices rather than detections. A repo can hold several compose
 * files (a Dokploy one, a local-dev one, a CI one) and deploying the wrong one
 * produces a broken stack rather than a readable failure. And Dokploy writes
 * the port chosen here straight into the service's Traefik
 * `loadbalancer.server.port` label, so a wrong port is a permanent Bad Gateway
 * behind a perfectly valid certificate — which is why nothing is defaulted
 * when the compose file states no port.
 */

import { useEffect } from "react";
import type { ComposeAnalysis, WizardState } from "../types";

export default function ComposeServices({
  compose,
  state,
  onChange,
}: {
  compose: ComposeAnalysis;
  state: WizardState;
  onChange: (next: WizardState["compose"]) => void;
}) {
  const selectedPath = state.compose.path || compose.path;
  const selected = state.compose.entryService ?? compose.entryService;
  const port = state.compose.entryPort ?? compose.entryPort;

  // Seed the wizard's own state from the analysis once, so a user who changes
  // nothing still deploys the detected file and service.
  useEffect(() => {
    if (state.compose.path) return;
    onChange({
      path: compose.path,
      entryService: compose.entryService,
      entryPort: compose.entryPort,
    });
    // Deliberately keyed on the analysed path only: re-running on every
    // onChange identity change would clobber the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose.path]);

  /** Services the user can actually route a domain to. */
  const routable = compose.services.filter((s) => !s.buildOnly);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Which compose file ─────────────────────────────────── */}
      {compose.candidates.length > 1 && (
        <div>
          <label htmlFor="compose-file" className="block text-sm font-semibold mb-1">
            Compose file
          </label>
          <p className="text-xs text-muted-ink mb-2">
            This repository has {compose.candidates.length} compose files. Pick the one that describes
            your deployment — a local-development stack usually will not run here.
          </p>
          <select
            id="compose-file"
            value={selectedPath}
            onChange={(e) => onChange({ ...state.compose, path: e.target.value })}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            {compose.candidates.map((c) => (
              <option key={c.path} value={c.path}>
                {c.path} — {c.reason}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Which service is public ────────────────────────────── */}
      <div>
        <span className="block text-sm font-semibold mb-1">Public service</span>
        <p className="text-xs text-muted-ink mb-2">
          Your domain routes to one service in the stack. The others keep running and talk to it over
          the internal network.
        </p>

        {/* Real radio inputs rather than role-annotated list items: a native
            radiogroup already gives arrow-key navigation, a single tab stop and
            correct screen-reader semantics, none of which clickableProps on an
            <li> can provide. */}
        <ul className="flex flex-col gap-1.5">
          {routable.map((svc) => {
            const isSelected = svc.name === selected;
            return (
              <li key={svc.name}>
                <label
                  className={`flex items-center gap-3 rounded-lg border-2 px-3 py-2 cursor-pointer transition-colors ${
                    isSelected ? "border-primary-500 bg-primary/10" : "border-border hover:border-primary-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="compose-entry-service"
                    value={svc.name}
                    checked={isSelected}
                    onChange={() =>
                      onChange({ ...state.compose, entryService: svc.name, entryPort: svc.port })
                    }
                    className="shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-text truncate">{svc.name}</span>
                    <span className="block text-xs text-text-muted truncate">
                      {svc.engine
                        ? `${svc.engine} — the stack runs this itself`
                        : svc.image ?? "built from your repository"}
                    </span>
                  </span>
                  {svc.port ? (
                    <span className="text-xs font-mono text-text-muted shrink-0">:{svc.port}</span>
                  ) : (
                    <span className="text-xs text-warning-500 shrink-0">no port declared</span>
                  )}
                  {!svc.routable && (
                    <span
                      className="text-xs text-warning-500 shrink-0"
                      title="Not attached to dokploy-network, so Traefik cannot reach it"
                    >
                      not reachable
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Port ───────────────────────────────────────────────── */}
      {selected && (
        <div>
          <label htmlFor="compose-port" className="block text-sm font-semibold mb-1">
            Container port
          </label>
          <p className="text-xs text-muted-ink mb-2">
            The port <code className="font-mono">{selected}</code> listens on inside its container —
            not a host port. Traffic is forwarded here.
          </p>
          <input
            id="compose-port"
            type="number"
            min={1}
            max={65535}
            value={port ?? ""}
            placeholder="e.g. 3000"
            onChange={(e) =>
              onChange({
                ...state.compose,
                entryPort: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono"
          />
          {!port && (
            <p className="text-xs text-warning-ink mt-1">
              This compose file does not declare a port for {selected}. Without one the stack still
              deploys, but no domain is attached.
            </p>
          )}
        </div>
      )}

      {/* ── Variables the stack requires ───────────────────────── */}
      {compose.requiredVars.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-subtle p-3">
          <p className="text-sm font-semibold mb-1">
            Required environment variables
          </p>
          <p className="text-xs text-muted-ink mb-2">
            This compose file will not start without these. Set them in the project's environment
            variables; the deploy stops early and names any that are missing.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {compose.requiredVars.map((name) => (
              <li key={name} className="rounded-sm bg-surface px-1.5 py-0.5 text-xs font-mono">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Sizing ─────────────────────────────────────────────── */}
      {routable.length >= 3 && state.selectedPlan === 0 && (
        <p className="text-xs text-warning-ink">
          This stack runs {routable.length} containers on one machine. The smallest plan may not have
          enough memory — consider a larger one below.
        </p>
      )}

      {/* ── What Dockier will not do for a compose stack ────────── */}
      {compose.declaresDatabase && (
        <p className="text-xs text-muted-ink">
          This stack runs its own{" "}
          {compose.databases.map((d) => d.engine).join(", ")}, so Dockier will not provision a
          separate database for it.
        </p>
      )}
    </div>
  );
}
