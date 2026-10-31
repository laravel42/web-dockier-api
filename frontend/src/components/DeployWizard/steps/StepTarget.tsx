/**
 * Step 3 — Deploy target.
 *
 * WHAT kind of deploy this is, separated from the Plan step's "how big and
 * where". The two are different decisions: the target changes which pipeline
 * runs and what the result even is (a container, a CDN-served bundle, or a
 * stack of services), while the plan only sizes the machine.
 *
 * Docker Compose also needs follow-up configuration — which file, which service
 * is public, on which port — and that has no sensible home among region and
 * instance-size cards.
 */

import type { RepoAnalysis, WizardState } from "../types";
import { isServerOnly } from "../serverOnly";
import { ServerIcon, GlobeIcon, LayersIcon, CircleCheckIcon } from "lucide-react";
import ComposeServices from "./ComposeServices";

/** Per-provider names for the static hosting stack, for accurate labelling. */
const STATIC_STACK: Record<string, string> = {
  aws: "S3 + CloudFront",
  gcp: "Cloud Storage + Cloud CDN",
};

export default function StepTarget({
  state,
  analysis,
  onStrategyChange,
  onComposeChange,
}: {
  state: WizardState;
  /**
   * The repo analysis. Server-only-ness is derived from it via `isServerOnly`,
   * which uses `staticCapable` when present and falls back to the detected
   * runtime/framework otherwise (so analyses cached before `staticCapable`
   * existed are still handled). Never hides Static on genuine uncertainty.
   */
  analysis: RepoAnalysis | null;
  onStrategyChange: (strategy: "vps" | "static" | "compose") => void;
  /** Persists the compose file + public service choices into wizard state. */
  onComposeChange: (next: WizardState["compose"]) => void;
}) {
  const serverOnly = isServerOnly(analysis);
  // A compose file with blocking problems (a build context that does not exist)
  // is not offered: deploying it produces a build failure, and the Analysis
  // step already explained why.
  const compose = analysis?.compose?.problems.length === 0 ? analysis.compose : null;
  const hasCompose = Boolean(compose);
  const isCompose = state.deployStrategy === "compose" && hasCompose;
  const isStatic = state.deployStrategy === "static" && !serverOnly;
  const isServer = !isCompose && !isStatic;
  const staticStack = STATIC_STACK[state.selectedProvider] || "object storage + CDN";
  // Server is always offered; Compose only with a deployable compose file;
  // Static only when the repo is not confidently server-only.
  const cardCount = 1 + (hasCompose ? 1 : 0) + (serverOnly ? 0 : 1);

  const cardCls = (selected: boolean) =>
    `flex flex-col gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
      selected
        ? "border-primary-500 bg-primary/10 shadow-(--shadow-xs)"
        : "border-border bg-card hover:border-primary-300"
    }`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Deploy target</p>

        {/* The settled-fact line is for when there is genuinely ONE option, so
            it needs `!hasCompose` too. A server-only verdict only rules out
            STATIC hosting; it says nothing about Docker Compose, which also
            runs on a virtual machine. */}
        {serverOnly && !hasCompose ? (
          /* No choice to make — present it as a settled fact, not a card. A
             selectable-styled card with one option reads as a decision that
             isn't one. */
          <div className="flex items-start gap-2 text-sm text-text">
            <ServerIcon className="size-4 text-text-secondary shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Server.</span>{" "}
              <span className="text-text-muted">
                This project is configured to run on a server, so static hosting isn&apos;t available — your app
                runs on a virtual machine.
              </span>
            </span>
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-3 ${cardCount === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {/* FIRST when present, and pre-selected by the wizard hook: a repo
                that ships a compose file has already described how it expects
                to run, which outranks any inference we make about a single
                container. */}
            {hasCompose && (
              <button type="button" onClick={() => onStrategyChange("compose")} aria-pressed={isCompose} className={cardCls(isCompose)}>
                <div className="flex items-center gap-2">
                  <LayersIcon className="size-4 text-text-secondary shrink-0" />
                  <span className="text-sm font-semibold text-text">Docker Compose</span>
                  {isCompose && <CircleCheckIcon className="size-4 text-primary-500 ml-auto" />}
                </div>
                <p className="text-xs/relaxed text-text-muted">
                  Runs your repository&apos;s compose file as one stack on a virtual machine — every
                  service together, on its own network.
                </p>
              </button>
            )}

            <button type="button" onClick={() => onStrategyChange("vps")} aria-pressed={isServer} className={cardCls(isServer)}>
              <div className="flex items-center gap-2">
                <ServerIcon className="size-4 text-text-secondary shrink-0" />
                <span className="text-sm font-semibold text-text">Server</span>
                {isServer && <CircleCheckIcon className="size-4 text-primary-500 ml-auto" />}
              </div>
              <p className="text-xs/relaxed text-text-muted">
                {hasCompose
                  ? "Ignores the compose file and deploys a single container built from your repository."
                  : "Runs your app on a virtual machine. Needed for a backend, server-side rendering, or a database."}
              </p>
            </button>

            {/* Hidden on a confident server-only verdict: a static deploy of a
                backend app cannot work, and offering it invites a failure. */}
            {!serverOnly && (
              <button type="button" onClick={() => onStrategyChange("static")} aria-pressed={isStatic} className={cardCls(isStatic)}>
                <div className="flex items-center gap-2">
                  <GlobeIcon className="size-4 text-text-secondary shrink-0" />
                  <span className="text-sm font-semibold text-text">Static hosting</span>
                  {isStatic && <CircleCheckIcon className="size-4 text-primary-500 ml-auto" />}
                </div>
                <p className="text-xs/relaxed text-text-muted">
                  Uploads your built site to {staticStack}. No server to pay for, served from the edge. Only for
                  sites that build to static files.
                </p>
              </button>
            )}
          </div>
        )}

        {/* The information the settled-fact line carried, preserved for the
            case where the grid is shown but Static is not an option. */}
        {serverOnly && hasCompose && (
          <p className="mt-2 text-xs/relaxed text-text-muted">
            Static hosting isn&apos;t available for this project — it needs a running server.
          </p>
        )}
        {isStatic && (
          <p className="mt-2 text-xs/relaxed text-text-muted">
            Your site is built from source and the output uploaded, so no instance size applies.
          </p>
        )}
      </div>

      {/* Compose configuration: which file, which service is public, its port,
          and the variables the stack will not start without. */}
      {isCompose && compose && (
        <div className="pt-4 border-t border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Compose configuration</p>
          <ComposeServices compose={compose} state={state} onChange={onComposeChange} />
        </div>
      )}
    </div>
  );
}
