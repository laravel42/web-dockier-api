import type { Deployment as DeployInfo, Provider as ProviderInfo } from "../../../types";
import { cardCls, chipCls, strategyLabels } from "../../../utils/styles";
import { timeAgo } from "../../../utils/timeAgo";
import ProviderBadge from "../../../components/ProviderBadge";
import { getProviderStyle } from "../../../data/providers";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import StatusBadge from "../../../components/badges/StatusBadge";
import { usePermissions } from "../../../context/PermissionsContext";

interface Props {
  deploys: DeployInfo[];
  allProviders: ProviderInfo[];
  navigate: (path: string) => void;
  destroying?: boolean;
  onDestroy?: () => void;
}

export default function RecentDeploys({ deploys, allProviders, navigate, destroying, onDestroy }: Props) {
  const { has } = usePermissions();
  const canDestroy = has("deploy:manage");
  if (!deploys.length) return null;

  const providerKey = (providerId: string) =>
    allProviders.find((p) => p.id === providerId)?.provider || "";

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Deploys</h2>
      <div className={`${cardCls} divide-y divide-border`}>
        {deploys.map((d, index) => {
          const isLatest = index === 0;

          const pk = providerKey(d.providerId);
          const providerLabel = getProviderStyle(pk).name || pk.toUpperCase();
          const strategyLabel = d.deployStrategy ? strategyLabels[d.deployStrategy] || d.deployStrategy : "";

          return (
            <div key={d.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <ProviderBadge provider={pk} showName={false} iconSize="size-4" />
                <button
                  onClick={() => navigate(`/deploy/${d.id}`)}
                  className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate text-left"
                >
                  {d.branch}{d.commitHash ? ` @ ${d.commitHash.substring(0, 7)}` : ""}
                </button>
                {isLatest && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 bg-primary/10 text-primary">
                    Last
                  </span>
                )}
                <StatusBadge status={d.status} />
                {(providerLabel || strategyLabel) && (
                  <span className={`${chipCls} whitespace-nowrap`}>
                    {providerLabel}
                    {strategyLabel && ` · ${strategyLabel}`}
                  </span>
                )}
                <span className="text-xs text-text-muted ml-auto shrink-0">{timeAgo(d.createdAt)}</span>
              </div>
              {d.dockerImage && (
                <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5 pl-6">
                  <span className="font-mono truncate max-w-30" title={d.dockerImage}>
                    {d.dockerImage.split("/").pop()?.split(":")[0] || d.dockerImage}
                  </span>
                </div>
              )}
              {(d.appUrl || d.id) && (
                <div className="flex items-center gap-2 mt-0.5 pl-6">
                  {d.appUrl && (
                    <>
                      <LinkIcon className="size-4 text-text-muted shrink-0" />
                      <a
                        href={d.appUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-500 hover:text-primary-700 transition-colors"
                      >
                        {d.appUrl}
                      </a>
                    </>
                  )}
                  <div className="flex items-center gap-3 ml-auto shrink-0">
                    {isLatest && canDestroy && d.status === "success" && onDestroy && (
                      <button
                        type="button"
                        disabled={destroying}
                        onClick={onDestroy}
                        className="text-xs text-danger-500 hover:text-danger-700 font-medium transition-colors disabled:opacity-50"
                      >
                        {destroying ? "Destroying…" : "Destroy"}
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/deploy/${d.id}`)}
                      className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors"
                    >
                      View details →
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
