import { useDeploy } from "./useDeploy";
import DeployEmptyState from "./sections/EmptyState";
import DeployCard from "./sections/DeployCard";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";

export default function Deploy() {
  const { navigate, deployments, loading, error, reload, projectLangs, projectById, grouped } = useDeploy();

  if (loading) {
    return <PageLoading />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Deployments" />
        <PageError message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Deployments" />

      {deployments.length === 0 ? (
        <DeployEmptyState onGoToProjects={() => navigate("/projects")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {grouped.map(([groupKey, repoDeploys]) => {
            const proj = projectById[groupKey];
            const latest = repoDeploys.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )[0];
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
