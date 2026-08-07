import type { Deployment as DeployInfo, Provider as ProviderInfo } from "@/types";
import { cardCls } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { getDeployServiceLabel } from "@/utils/deployService";
import { getProviderStyle } from "@/data/providers";
import ProviderBadge from "@/components/ProviderBadge";
import StatusRingIcon from "@/components/badges/StatusRingIcon";
import BranchCommitLabel from "@/components/BranchCommitLabel";

interface Props {
  deploys: DeployInfo[];
  allProviders: ProviderInfo[];
  navigate: (path: string) => void;
  fallbackCommitHash?: string;
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

export default function RecentDeploys({
  deploys,
  allProviders,
  navigate,
  fallbackCommitHash,
}: Props) {
  if (!deploys.length) return null;

  const providerKey = (providerId: string) =>
    allProviders.find((p) => p.id === providerId)?.provider || "";

  const rows = buildRows(deploys);

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Deploys</h2>
      <div className={`${cardCls} p-4 flex-1`}>
        <ol className="relative">
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            const lineTop = row.type === "header" ? "top-6" : "top-9";
            const pk = row.type === "deploy" ? providerKey(row.deploy.providerId) : "";
            const providerName = pk ? getProviderStyle(pk).name || pk.toUpperCase() : "";
            const service = row.type === "deploy" ? getDeployServiceLabel(pk, row.deploy.deployStrategy) : "";
            return (
              <li key={row.key} className="relative flex gap-4 pb-4 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-4 ${lineTop} bottom-0 w-px -translate-x-1/2 bg-border`}
                  />
                )}
                {row.type === "header" ? (
                  <>
                    <div className="relative z-10 flex size-8 shrink-0 items-center justify-center">
                      <span className="size-2.5 rounded-full bg-border ring-4 ring-card" />
                    </div>
                    <span className="text-[14px] font-bold text-text-muted pt-1.5">{row.label}</span>
                  </>
                ) : (
                  <>
                    <div className="relative z-10 shrink-0 flex size-8 items-center justify-center rounded-full bg-card ring-2 ring-border">
                      <ProviderBadge provider={pk} showName={false} iconSize="size-4" />
                      <StatusRingIcon status={row.deploy.status} />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <BranchCommitLabel
                          branch={row.deploy.branch}
                          commit={row.deploy.commitHash || fallbackCommitHash || undefined}
                          onClick={() => navigate(`/deploy/${row.deploy.id}`)}
                        />
                      </div>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-text-muted mt-1">
                        {providerName && <span className="font-medium text-text-secondary">{providerName}</span>}
                        {service && (
                          <>
                            <span>·</span>
                            <span>{service}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatCardDateTime(row.deploy.createdAt)}</span>
                        {row.deploy.dockerImage && (
                          <>
                            <span>·</span>
                            <span className="font-mono truncate max-w-40" title={row.deploy.dockerImage}>
                              {row.deploy.dockerImage.split("/").pop()?.split(":")[0] || row.deploy.dockerImage}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
