import type { Deployment as Deploy, Provider, Project } from "../../../types";
import { cardCls, getStatusDotClass } from "../../../utils/styles";
import ProviderBadge from "../../../components/ProviderBadge";

interface Props {
  deploys: Deploy[];
  providers: Provider[];
  projectMap: Record<string, Project>;
  onViewAll: () => void;
  onViewDeploy: (id: string) => void;
}

export default function RecentDeploys({ deploys, providers, projectMap, onViewAll, onViewDeploy }: Props) {
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Recent Deployments</h2>
        <button onClick={onViewAll} className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors">View all</button>
      </div>
      {deploys.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No deployments yet</p>
      ) : (
        <div className="divide-y divide-border">
          {deploys.map((d) => {
            const prov = providers.find(p => p.id === d.providerId);
            const pk = prov?.provider || "";
            const projectName = projectMap[d.projectId]?.name || d.repo;
            const statusDot = getStatusDotClass(d.status);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onViewDeploy(d.id)}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-secondary-50/50 transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text truncate">{projectName}</p>
                  <p className="text-xs text-text-muted">{d.branch} · {new Date(d.createdAt).toLocaleDateString()}</p>
                </div>
                <ProviderBadge provider={pk} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
