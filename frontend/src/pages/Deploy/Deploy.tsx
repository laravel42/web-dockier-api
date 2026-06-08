import { useDeploy } from "./useDeploy";
import DeployEmptyState from "./sections/EmptyState";
import DeployCard from "./sections/DeployCard";
import DeployTable from "./sections/DeployTable";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import GridIcon from "../../components/icons/outlined/GridIcon";
import Bars3Icon from "../../components/icons/outlined/Bars3Icon";

export default function Deploy() {
  const {
    navigate,
    deployments,
    loading,
    error,
    reload,
    projectLangs,
    projectById,
    grouped,
    viewMode,
    changeViewMode,
  } = useDeploy();

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
      <PageHeader
        title="Deployments"
        actions={
          deployments.length > 0 ? (
            <div className="flex items-center bg-secondary-50 border border-border rounded-lg p-0.5 h-10">
              <button
                onClick={() => changeViewMode("cards")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "cards" ? "bg-card text-primary-500 shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                title="Card view"
              >
                <GridIcon />
              </button>
              <button
                onClick={() => changeViewMode("table")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-card text-primary-500 shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                title="Table view"
              >
                <Bars3Icon />
              </button>
            </div>
          ) : undefined
        }
      />

      {deployments.length === 0 ? (
        <DeployEmptyState onGoToProjects={() => navigate("/projects")} />
      ) : viewMode === "table" ? (
        <DeployTable
          grouped={grouped}
          projectById={projectById}
          projectLangs={projectLangs}
          onSelect={(id) => navigate(`/deploy/${id}`)}
        />
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
