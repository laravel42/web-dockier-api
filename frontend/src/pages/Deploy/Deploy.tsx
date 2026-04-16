import { useDeploy } from "./useDeploy";
import EmptyState from "./sections/EmptyState";
import DeployCard from "./sections/DeployCard";

export default function Deploy() {
  const { navigate, deployments, loading, projectLangs, projectById, grouped } = useDeploy();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Deployments</h1>
      </div>

      {deployments.length === 0 ? (
        <EmptyState onGoToProjects={() => navigate("/projects")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {grouped.map(([groupKey, repoDeploys]) => {
            const proj = projectById[groupKey];
            const latest = repoDeploys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            return (
              <DeployCard
                key={groupKey}
                repo={latest.repo}
                deploys={repoDeploys}
                project={proj}
                badges={proj ? projectLangs[proj.id] : undefined}
                onClick={() => navigate(`/deploy/${latest.id}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
