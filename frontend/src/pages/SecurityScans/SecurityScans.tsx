import { useSecurityScans } from "./useSecurityScans";
import ScanProjectCard from "./sections/ScanProjectCard";
import ScanProjectTable from "./sections/ScanProjectTable";
import EmptyProjectCard from "./sections/EmptyProjectCard";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import EmptyState from "../../components/ui/EmptyState";
import ShieldCheckIcon from "../../components/icons/outlined/ShieldCheckIcon";
import GridIcon from "../../components/icons/outlined/GridIcon";
import Bars3Icon from "../../components/icons/outlined/Bars3Icon";

export default function SecurityScans() {
  const {
    navigate,
    loading,
    error,
    reload,
    projects,
    grouped,
    sortedProjectIds,
    viewMode,
    changeViewMode,
  } = useSecurityScans();

  const viewToggle = (
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
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Security Scans" />
        <PageLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Security Scans" />
        <PageError message={error} onRetry={reload} />
      </div>
    );
  }

  if (sortedProjectIds.length === 0) {
    return (
      <div>
        <PageHeader title="Security Scans" />
        <EmptyState
          icon={<ShieldCheckIcon className="w-12 h-12" />}
          description="No projects yet. Create a project first to run security scans."
          action={{ label: "Go to Projects", onClick: () => navigate("/projects") }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Security Scans" actions={viewToggle} />
      {viewMode === "table" ? (
        <ScanProjectTable
          sortedProjectIds={sortedProjectIds}
          grouped={grouped}
          projects={projects}
          onSelectScan={(scanId) => navigate(`/security/${scanId}`)}
          onSelectEmpty={(projectId) => navigate(`/security/project/${projectId}`)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sortedProjectIds.map((projectId) => {
            const projectScans = grouped[projectId];
            if (!projectScans || projectScans.length === 0) {
              return (
                <EmptyProjectCard
                  key={projectId}
                  project={projects[projectId]}
                  projectId={projectId}
                  onSelect={() => navigate(`/security/project/${projectId}`)}
                />
              );
            }
            return (
              <ScanProjectCard
                key={projectId}
                project={projects[projectId]}
                projectId={projectId}
                scans={projectScans}
                onSelect={(scanId) => navigate(`/security/${scanId}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
