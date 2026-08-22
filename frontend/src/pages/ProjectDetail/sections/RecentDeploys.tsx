import type { Deployment as DeployInfo, Provider as ProviderInfo } from "@/types";
import { cardCls, typeCardDateCls } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { getDeployServiceLabel } from "@/utils/deployService";
import { getProviderStyle } from "@/data/providers";
import ProviderBadge from "@/components/ProviderBadge";
import EmptyState from "@/components/ui/EmptyState";
import BranchCommitLabel from "@/components/BranchCommitLabel";

interface Props {
  deploys: DeployInfo[];
  allProviders: ProviderInfo[];
  navigate: (path: string) => void;
  fallbackCommitHash?: string;
  /** Non-empty when the fetch failed — never conflated with "no deploys". */
  error?: string;
  onRetry?: () => void;
  /** Opens the deploy wizard from the empty state. */
  onDeploy?: () => void;
}

function dayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type TimelineRow =
  | { type: "header"; key: string; label: string }
  | { type: "deploy"; key: string; deploy: DeployInfo };

function buildRows(deploys: DeployInfo[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let currentDay = "";
  for (const deploy of deploys) {
    const day = new Date(deploy.createdAt).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      rows.push({ type: "header", key: `day-${day}`, label: dayLabel(deploy.createdAt) });
    }
    rows.push({ type: "deploy", key: deploy.id, deploy });
  }
  return rows;
}

function statusDot(status: string): string {
  if (status === "failed") return "bg-danger-500";
  if (status === "success") return "bg-success-500";
  if (status === "destroyed" || status === "cancelled") return "bg-secondary-400";
  return "bg-primary-500";
}

const rowCls =
  "flex min-w-0 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-card/40";

export default function RecentDeploys({
  deploys,
  allProviders,
  navigate,
  fallbackCommitHash,
  error,
  onRetry,
  onDeploy,
}: Props) {

  const providerKey = (providerId: string) =>
    allProviders.find((p) => p.id === providerId)?.provider || "";

  // A failed request is not an empty history. Saying "hasn't been deployed yet"
  // because the network dropped tells the user something false about their project.
  if (error) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-text mb-4">Recent Deploys</h2>
        <EmptyState
          compact
          title="Couldn't load deploys"
          description={error}
          action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
        />
      </div>
    );
  }

  if (!deploys.length) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-text mb-4">Recent Deploys</h2>
        <EmptyState
          compact
          description="This project hasn't been deployed yet. Deploying ships the current branch."
          action={onDeploy ? { label: "Deploy this project", onClick: onDeploy } : undefined}
        />
      </div>
    );
  }

  const rows = buildRows(deploys);
  const open = (id: string) => navigate(`/deploy/${id}`);

  return (
    /* No min-h-0 anywhere in this chain: the card should fill spare panel height
       but never be squeezed below its own rows. */
    <div className="flex min-w-0 flex-1 flex-col">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Deploys</h2>
      {/* Vertical-only card padding so hover bands and day rules reach the card edges. */}
      <div className={`${cardCls} flex-1 py-2`}>
      <ul className="min-w-0">
      {rows.map((row, i) => {
        if (row.type === "header") {
          return (
            <li
              key={row.key}
              className={`flex items-center gap-3 px-4 pt-3 pb-1.5 ${i > 0 ? "mt-1 border-t border-border/40" : ""}`}
            >
              <span className="flex w-2 shrink-0 justify-center">
                <span className="size-2.5 rounded-full bg-border" />
              </span>
              <span className="text-sm font-bold text-text-muted">{row.label}</span>
            </li>
          );
        }
        const pk = providerKey(row.deploy.providerId);
        const providerName = pk ? getProviderStyle(pk).name || pk.toUpperCase() : "";
        const service = getDeployServiceLabel(pk, row.deploy.deployStrategy);
        const infraLabel = [providerName, service].filter(Boolean).join(" · ");
        return (
          /* No rule directly under a day heading — the heading is the divider. */
          <li key={row.key} className={rows[i - 1]?.type === "deploy" ? "border-t border-border/40" : ""}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => open(row.deploy.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open(row.deploy.id);
                }
              }}
              className={rowCls}
            >
              <span className={`size-2 shrink-0 rounded-full ${statusDot(row.deploy.status)}`} />
              <div className="min-w-0 flex-1 overflow-hidden">
                <BranchCommitLabel
                  branch={row.deploy.branch}
                  commit={row.deploy.commitHash || fallbackCommitHash}
                />
              </div>
              {infraLabel && (
                <span className="hidden min-w-0 max-w-48 shrink-0 items-center gap-1.5 truncate text-ui text-text sm:inline-flex">
                  {pk ? <ProviderBadge provider={pk} showName={false} iconSize="size-3.5" /> : null}
                  <span className="truncate">{infraLabel}</span>
                </span>
              )}
              <span className={`${typeCardDateCls} shrink-0`}>{formatCardDateTime(row.deploy.createdAt)}</span>
            </div>
          </li>
        );
      })}
      </ul>
      </div>
    </div>
  );
}
