import type { Deployment as Deploy, Provider, Project } from "@/types";
import { cardCls, typeCardDateCls, typeCardTitle, typePanelDesc, typePanelTitle, dashboardActivityRowCls } from "@/utils/styles";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { formatCardDateTime } from "@/utils/formatCardDate";
import ProviderBadge from "@/components/ProviderBadge";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { projectInfraDotClass } from "@/utils/projectInfraDot";

interface Props {
  deploys: Deploy[];
  providers: Provider[];
  projectMap: Record<string, Project>;
  fallbackCommitByProject?: Record<string, string>;
  loading?: boolean;
  onViewAll: () => void;
  onViewDeploy: (id: string) => void;
}

export default function RecentDeploys({ deploys, providers, projectMap, fallbackCommitByProject, loading, onViewAll, onViewDeploy }: Props) {
  return (
    <div className={cardCls}>
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className={typePanelTitle}>Recent Deployments</h2>
          <p className={`${typePanelDesc} mt-0.5`}>Latest activity</p>
        </div>
        <Button variant="link" onClick={onViewAll}>
          View all
        </Button>
      </div>
      {loading ? (
        <ul className="divide-y divide-border/40" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-2 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-5 w-14" />
            </li>
          ))}
        </ul>
      ) : deploys.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No deployments yet</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {deploys.map((d) => {
            const prov = providers.find((p) => p.id === d.providerId);
            const pk = prov?.provider || "";
            const projectName = projectMap[d.projectId]?.name || d.repo;
            const statusDot = projectInfraDotClass(projectMap[d.projectId]?.infraState, d.status);
            return (
              <li key={d.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onViewDeploy(d.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onViewDeploy(d.id);
                    }
                  }}
                  className={dashboardActivityRowCls}
                >
                  <span className={`size-2 rounded-full shrink-0 ${statusDot}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`${typeCardTitle} truncate`}>{projectName}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <BranchCommitLabel
                        branch={d.branch}
                        commit={d.commitHash || fallbackCommitByProject?.[d.projectId] || undefined}
                        onClick={() => onViewDeploy(d.id)}
                      />
                      <span className={typeCardDateCls}>{formatCardDateTime(d.createdAt)}</span>
                    </div>
                  </div>
                  <ProviderBadge provider={pk} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
