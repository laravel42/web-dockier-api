import type { Deployment as DeployInfo, Provider as ProviderInfo } from "../../../types";
import { cardCls, strategyLabels } from "../../../utils/styles";
import { timeAgo } from "../../../utils/timeAgo";
import ProviderBadge from "../../../components/ProviderBadge";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import StatusBadge from "../../../components/badges/StatusBadge";

interface Props {
  deploys: DeployInfo[];
  allProviders: ProviderInfo[];
  navigate: (path: string) => void;
}


export default function RecentDeploys({ deploys, allProviders, navigate }: Props) {
  if (!deploys.length) return null;

  const providerKey = (providerId: string) =>
    allProviders.find((p) => p.id === providerId)?.provider || "";

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Recent Deploys</h2>
      <div className={`${cardCls} divide-y divide-border`}>
        {deploys.map((d) => (
          <div key={d.id} className="px-4 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <button
                  onClick={() => navigate(`/deploy/${d.id}`)}
                  className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate text-left"
                >
                  {d.branch}{d.commitHash ? ` @ ${d.commitHash.substring(0, 7)}` : ""}
                </button>
                <StatusBadge status={d.status} />
                <ProviderBadge provider={providerKey(d.providerId)} suffix={d.deployStrategy ? ` · ${strategyLabels[d.deployStrategy] || d.deployStrategy}` : ""} iconSize="w-3 h-3" />
                <span className="text-xs text-text-muted ml-auto shrink-0">{timeAgo(d.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {d.dockerImage && (
                  <span className="font-mono truncate max-w-30" title={d.dockerImage}>
                    {d.dockerImage.split("/").pop()?.split(":")[0] || d.dockerImage}
                  </span>
                )}
              </div>
              {(d.appUrl || d.id) && (
                <div className="flex items-center gap-2 mt-1">
                  {d.appUrl && (
                    <>
                      <LinkIcon className="w-4 h-4 text-text-muted shrink-0" />
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
                  <button
                    onClick={() => navigate(`/deploy/${d.id}`)}
                    className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors ml-auto shrink-0"
                  >
                    View details →
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
