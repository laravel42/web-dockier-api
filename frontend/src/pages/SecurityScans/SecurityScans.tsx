import { useMemo, useState } from "react";
import { useSecurityScans } from "./useSecurityScans";
import ScanProjectCard from "./sections/ScanProjectCard";
import ScanProjectTable from "./sections/ScanProjectTable";
import EmptyProjectCard from "./sections/EmptyProjectCard";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import EmptyState from "../../components/ui/EmptyState";
import ListToolbar from "../../components/ui/ListToolbar";
import { EmptyMessage } from "../../components/ui/PageError";
import { ShieldCheckIcon } from "lucide-react";

export default function SecurityScans() {
  const [search, setSearch] = useState("");
  const {
    navigate,
    loading,
    error,
    reload,
    projects,
    grouped,
    sortedProjectIds,
    projectLangs,
    projectBadgeLoading,
    viewMode,
    changeViewMode,
  } = useSecurityScans();

  const filteredProjectIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedProjectIds;
    return sortedProjectIds.filter((id) => {
      const name = (projects[id]?.name || id).toLowerCase();
      return name.includes(q);
    });
  }, [sortedProjectIds, projects, search]);

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
          icon={<ShieldCheckIcon className="size-12" />}
          description="No projects yet. Create a project first to run security scans."
          action={{ label: "Go to Projects", onClick: () => navigate("/projects") }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Security Scans"
        description={`${sortedProjectIds.length} ${sortedProjectIds.length === 1 ? "project" : "projects"}`}
      />

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by project name"
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
      />

      {filteredProjectIds.length === 0 ? (
        <EmptyMessage>No projects match your search.</EmptyMessage>
      ) : viewMode === "table" ? (
        <ScanProjectTable
          sortedProjectIds={filteredProjectIds}
          grouped={grouped}
          projects={projects}
          projectLangs={projectLangs}
          projectBadgeLoading={projectBadgeLoading}
          onSelectScan={(scanId) => navigate(`/security/${scanId}`)}
          onSelectEmpty={(projectId) => navigate(`/security/project/${projectId}`)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProjectIds.map((projectId) => {
            const projectScans = grouped[projectId];
            if (!projectScans || projectScans.length === 0) {
              return (
                <EmptyProjectCard
                  key={projectId}
                  project={projects[projectId]}
                  projectId={projectId}
                  badges={projectLangs[projectId]}
                  badgeLoading={projectBadgeLoading.has(projectId)}
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
                badges={projectLangs[projectId]}
                badgeLoading={projectBadgeLoading.has(projectId)}
                onSelect={(scanId) => navigate(`/security/${scanId}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
