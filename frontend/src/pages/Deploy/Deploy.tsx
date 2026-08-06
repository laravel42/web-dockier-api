import { useMemo, useState } from "react";
import { useDeploy } from "./useDeploy";
import DeployEmptyState from "./sections/EmptyState";
import DeployCard from "./sections/DeployCard";
import DeployTable from "./sections/DeployTable";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import ListToolbar from "../../components/ui/ListToolbar";
import { EmptyMessage } from "../../components/ui/PageError";
import { compareByTime } from "../../utils/sortByTime";
import { cardGridCls } from "../../utils/styles";

export default function Deploy() {
  const [search, setSearch] = useState("");
  const {
    navigate,
    deployments,
    loading,
    error,
    reload,
    projectLangs,
    projectBadgeLoading,
    projectById,
    grouped,
    viewMode,
    changeViewMode,
  } = useDeploy();

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter(([groupKey, repoDeploys]) => {
      const proj = projectById[groupKey];
      const latest = [...repoDeploys].sort((a, b) => compareByTime(a, b, "updated"))[0];
      const name = (proj?.name || latest?.repo || "").toLowerCase();
      const repo = (latest?.repo || "").toLowerCase();
      return name.includes(q) || repo.includes(q);
    });
  }, [grouped, projectById, search]);

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
      <PageHeader title="Deployments" description={`${deployments.length} total deployments`} />

      {deployments.length === 0 ? (
        <DeployEmptyState onGoToProjects={() => navigate("/projects")} />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by project or repository"
            viewMode={viewMode}
            onViewModeChange={changeViewMode}
          />

          {filteredGrouped.length === 0 ? (
            <EmptyMessage>No deployments match your search.</EmptyMessage>
          ) : viewMode === "table" ? (
            <DeployTable
              grouped={filteredGrouped}
              projectById={projectById}
              projectLangs={projectLangs}
              projectBadgeLoading={projectBadgeLoading}
              onSelect={(id) => navigate(`/deploy/${id}`)}
            />
          ) : (
            <div className={cardGridCls}>
              {filteredGrouped.map(([groupKey, repoDeploys]) => {
                const proj = projectById[groupKey];
                const latest = [...repoDeploys].sort((a, b) => compareByTime(a, b, "updated"))[0];
                return (
                  <DeployCard
                    key={groupKey}
                    repo={latest.repo}
                    deploys={repoDeploys}
                    project={proj}
                    badges={proj ? projectLangs[proj.id] : undefined}
                    badgeLoading={proj ? projectBadgeLoading.has(proj.id) : false}
                    onClick={() => navigate(`/deploy/${latest.id}`)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
