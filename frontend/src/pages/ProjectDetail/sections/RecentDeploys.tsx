import type { DeployInfo, ProviderInfo } from "../types";
import { cardCls } from "../constants";
import ProviderBadge from "../../../components/ProviderBadge";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  deploys: DeployInfo[];
  allProviders: ProviderInfo[];
  navigate: (path: string) => void;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const statusColors: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  building: "bg-amber-100 text-amber-700",
  deploying: "bg-blue-100 text-blue-700",
  pending: "bg-gray-100 text-gray-600",
  destroyed: "bg-gray-100 text-gray-500",
};

const strategyLabels: Record<string, string> = { vps: "VPS", managed: "ECS Fargate" };

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
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 ${statusColors[d.status] || "bg-gray-100 text-gray-600"}`}>
                  {d.status}
                </span>
                <ProviderBadge provider={providerKey(d.providerId)} suffix={d.deployStrategy ? ` · ${strategyLabels[d.deployStrategy] || d.deployStrategy}` : ""} iconSize="w-3 h-3" />
                <span className="text-xs text-text-muted ml-auto shrink-0">{timeAgo(d.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {d.dockerImage && (
                  <span className="font-mono truncate max-w-[120px]" title={d.dockerImage}>
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
