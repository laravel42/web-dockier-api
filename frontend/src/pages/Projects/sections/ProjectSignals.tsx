import type { ReactNode } from "react";
import { RocketIcon, ShieldCheckIcon } from "lucide-react";
import SeverityBadge from "@/components/SeverityBadge";
import { timeAgo } from "@/utils/timeAgo";
import { scanFindingSeverityDotClass, scanStatusDot } from "@/utils/scanSummary";
import type { Deployment, DeploymentStatus, InfraState } from "@/types";
import type { ScanActivity } from "../useProjectActivity";

type DotAnim = "none" | "pulse" | "ping";

/** Status dot. `ping` draws an expanding ring (attention); `pulse` fades gently.
 * Both animations are gated on `motion-safe:` so prefers-reduced-motion is honoured. */
function Dot({ cls, anim = "none" }: { cls: string; anim?: DotAnim }) {
  if (anim === "ping") {
    return (
      <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
        <span className={`absolute inline-flex size-full rounded-full ${cls} opacity-75 motion-safe:animate-ping`} />
        <span className={`relative inline-flex size-1.5 rounded-full ${cls}`} />
      </span>
    );
  }
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${cls} ${anim === "pulse" ? "motion-safe:animate-pulse" : ""}`}
      aria-hidden="true"
    />
  );
}

const DEPLOY_VERB: Record<DeploymentStatus, string> = {
  success: "Deployed",
  failed: "Deploy failed",
  building: "Building",
  deploying: "Deploying",
  pending: "Queued",
  destroyed: "Torn down",
  cancelled: "Deploy cancelled",
};

const DEPLOY_SHORT: Record<DeploymentStatus, string> = {
  success: "Deployed",
  failed: "Failed",
  building: "Building",
  deploying: "Deploying",
  pending: "Queued",
  destroyed: "Torn down",
  cancelled: "Cancelled",
};

/**
 * Deploy status as a traffic light, keyed off the latest deploy's own status:
 *   green  = deployed (success) / live   (steady)
 *   red    = failed                      (ping — demands attention)
 *   amber  = in progress                 (pulse — work happening now)
 *   grey   = not deployed / destroyed / cancelled
 */
function deployDot(status: DeploymentStatus | undefined, infraState: InfraState | undefined): { cls: string; anim: DotAnim } {
  if (!status) return { cls: infraState === "live" ? "bg-success-500" : "bg-secondary-400", anim: "none" };
  if (status === "failed") return { cls: "bg-danger-500", anim: "ping" };
  if (status === "building" || status === "deploying" || status === "pending") return { cls: "bg-warning-500", anim: "pulse" };
  if (status === "success") return { cls: "bg-success-500", anim: "none" };
  return { cls: "bg-secondary-400", anim: "none" };
}

const rocket = <RocketIcon className="size-3.5" />;
const shield = <ShieldCheckIcon className="size-3.5" />;

/* ── Row variants (table) ────────────────────────────────────────────── */

function SignalRow({
  icon,
  dot,
  label,
  time,
  muted,
}: {
  icon: ReactNode;
  dot: ReactNode;
  label: string;
  time?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <span className="shrink-0 text-text-muted">{icon}</span>
      {dot}
      <span className={`truncate ${muted ? "text-text-muted" : "text-text"}`}>{label}</span>
      {time && <span className="ml-auto shrink-0 text-xs text-text-muted">{time}</span>}
    </div>
  );
}

export function DeploySignal({ deploy, infraState }: { deploy?: Deployment; infraState?: InfraState }) {
  const d = deployDot(deploy?.status, infraState);
  if (!deploy) {
    const live = infraState === "live";
    return <SignalRow icon={rocket} dot={<Dot cls={d.cls} anim={d.anim} />} label={live ? "Live" : "Not deployed yet"} muted={!live} />;
  }
  return (
    <SignalRow
      icon={rocket}
      dot={<Dot cls={d.cls} anim={d.anim} />}
      label={DEPLOY_VERB[deploy.status] ?? "Deployed"}
      time={timeAgo(deploy.updatedAt || deploy.createdAt)}
    />
  );
}

export function SecuritySignal({ scan }: { scan?: ScanActivity }) {
  if (!scan || scan.scanCount === 0 || (!scan.latest && !scan.latestCompleted)) {
    return <SignalRow icon={shield} dot={<Dot cls="bg-secondary-400" />} label="Not scanned yet" muted />;
  }
  const newest = scan.latest;
  if (newest && newest.status === "running") {
    return <SignalRow icon={shield} dot={<Dot cls="bg-primary-500" anim="pulse" />} label="Scanning…" />;
  }
  if (newest && newest.status === "pending") {
    return <SignalRow icon={shield} dot={<Dot cls="bg-secondary-400" />} label="Scan queued" />;
  }
  const completed = scan.latestCompleted;
  if (!completed && newest) {
    const { className, label } = scanStatusDot(newest.status, newest.summary);
    return <SignalRow icon={shield} dot={<Dot cls={className} />} label={label} time={timeAgo(newest.updatedAt || newest.createdAt)} />;
  }
  if (!completed) {
    return <SignalRow icon={shield} dot={<Dot cls="bg-secondary-400" />} label="Not scanned yet" muted />;
  }
  const { errors, warnings } = completed.summary;
  const when = timeAgo(completed.updatedAt || completed.createdAt);
  return (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <span className="shrink-0 text-text-muted">{shield}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {errors > 0 && <SeverityBadge severity="error" count={errors} size="compact" />}
        {warnings > 0 && <SeverityBadge severity="warning" count={warnings} size="compact" />}
        {errors === 0 && warnings === 0 && <SeverityBadge severity="clean" size="compact" />}
      </div>
      {when && <span className="ml-auto shrink-0 text-xs text-text-muted">{when}</span>}
    </div>
  );
}

/* ── Tile variants (project card, "signal tiles" layout) ─────────────────
 * Tiles stretch to equal height (grid align-items: stretch) and pin their
 * timestamp to the bottom (`mt-auto`), so the two tiles' footers line up
 * regardless of how much content each holds. */

function Tile({
  icon,
  label,
  footer,
  onClick,
  children,
}: {
  icon: ReactNode;
  label: string;
  footer?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls = `flex h-full flex-col rounded-lg bg-muted/60 px-2.5 py-2${
    onClick ? " cursor-pointer transition-colors hover:bg-muted" : ""
  }`;
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <span className="shrink-0">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {footer && <div className="mt-auto pt-1.5 text-xs text-text-muted">{footer}</div>}
    </>
  );
  // A native button so it is keyboard-operable on its own; stopPropagation keeps
  // the card's own navigation from also firing when the tile is clicked.
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`${cls} w-full text-left`}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function DeployTile({
  deploy,
  infraState,
  onClick,
}: {
  deploy?: Deployment;
  infraState?: InfraState;
  onClick?: () => void;
}) {
  const live = infraState === "live";
  const label = deploy ? DEPLOY_SHORT[deploy.status] ?? "Deployed" : live ? "Live" : "Not deployed";
  const settled = Boolean(deploy) || live;
  const d = deployDot(deploy?.status, infraState);
  const when = deploy ? timeAgo(deploy.updatedAt || deploy.createdAt) : undefined;
  return (
    <Tile icon={rocket} label="Deploy" footer={when} onClick={onClick}>
      <div className="flex items-center gap-1.5">
        <Dot cls={d.cls} anim={d.anim} />
        <span className={`truncate text-sm font-medium ${settled ? "" : "text-text-muted"}`}>{label}</span>
      </div>
    </Tile>
  );
}

export function SecurityTile({ scan, onClick }: { scan?: ScanActivity; onClick?: () => void }) {
  if (!scan || scan.scanCount === 0 || (!scan.latest && !scan.latestCompleted)) {
    return (
      <Tile icon={shield} label="Security" onClick={onClick}>
        <div className="flex items-center gap-1.5">
          <Dot cls="bg-secondary-400" />
          <span className="text-sm text-text-muted">Not scanned</span>
        </div>
      </Tile>
    );
  }
  const newest = scan.latest;
  if (newest && newest.status === "running") {
    return (
      <Tile icon={shield} label="Security" onClick={onClick}>
        <div className="flex items-center gap-1.5">
          <Dot cls="bg-primary-500" anim="pulse" />
          <span className="text-sm font-medium">Scanning…</span>
        </div>
      </Tile>
    );
  }
  const completed = scan.latestCompleted;
  if (!completed) {
    const dot = newest ? scanStatusDot(newest.status, newest.summary) : { className: "bg-secondary-400", label: "Pending" };
    return (
      <Tile icon={shield} label="Security" onClick={onClick}>
        <div className="flex items-center gap-1.5">
          <Dot cls={dot.className} />
          <span className="text-sm text-text-muted">{dot.label}</span>
        </div>
      </Tile>
    );
  }
  const { errors, warnings } = completed.summary;
  const when = timeAgo(completed.updatedAt || completed.createdAt);
  if (errors === 0 && warnings === 0) {
    return (
      <Tile icon={shield} label="Security" footer={when} onClick={onClick}>
        <div className="flex items-center gap-1.5">
          <Dot cls="bg-success-500" />
          <span className="text-sm font-medium text-success-ink">Clean</span>
        </div>
      </Tile>
    );
  }
  const sevCls = scanFindingSeverityDotClass({ errors, warnings });
  const lines = [
    errors > 0 && { cls: "text-danger-ink", n: errors, word: errors === 1 ? "error" : "errors" },
    warnings > 0 && { cls: "text-warning-ink", n: warnings, word: warnings === 1 ? "warning" : "warnings" },
  ].filter(Boolean) as { cls: string; n: number; word: string }[];
  return (
    <Tile icon={shield} label="Security" footer={when} onClick={onClick}>
      <div className="flex flex-col gap-0.5 text-sm">
        {lines.map((l, i) => (
          <div key={l.word} className="flex items-center gap-1.5">
            {i === 0 ? <Dot cls={sevCls} /> : <span className="size-1.5 shrink-0" aria-hidden="true" />}
            <span className={`font-semibold ${l.cls}`}>
              {l.n} <span className="font-normal text-text-muted">{l.word}</span>
            </span>
          </div>
        ))}
      </div>
    </Tile>
  );
}
