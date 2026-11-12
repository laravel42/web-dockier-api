import { useSecurityScans } from "./useSecurityScans";
import ScanProjectCard from "./sections/ScanProjectCard";
import ScanProjectTable from "./sections/ScanProjectTable";
import EmptyProjectCard from "./sections/EmptyProjectCard";
import PageHeader from "@/components/ui/PageHeader";
import PageLoading from "@/components/ui/PageLoading";
import PageError from "@/components/ui/PageError";
import EmptyState from "@/components/ui/EmptyState";
import ListToolbar from "@/components/ui/ListToolbar";
import Pagination from "@/components/ui/Pagination";
import { EmptyMessage } from "@/components/ui/PageError";
import { ShieldCheckIcon } from "lucide-react";
import { cardGridCls } from "@/utils/styles";

export default function SecurityScans() {
  const {
    navigate,
    loading,
    error,
    reload,
    projects,
    grouped,
    scanCounts,
    pagination,
    goToPage,
    search,
    handleSearch,
    sortedProjectIds,
    projectLangs,
    projectBadgeLoading,
    viewMode,
    changeViewMode,
  } = useSecurityScans();

  // Search and paging keep the toolbar mounted; only the very first load blanks the page.
  if (loading && sortedProjectIds.length === 0 && !search) {
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

  if (pagination.total === 0 && !search && !loading) {
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
        description={`${pagination.total} ${pagination.total === 1 ? "project" : "projects"}`}
      />

      <ListToolbar
        search={search}
        onSearchChange={handleSearch}
        searchPlaceholder="Search by project name"
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
      />

      {loading ? (
        <PageLoading />
      ) : sortedProjectIds.length === 0 ? (
        <EmptyMessage>No projects match your search.</EmptyMessage>
      ) : viewMode === "table" ? (
        <ScanProjectTable
          sortedProjectIds={sortedProjectIds}
          grouped={grouped}
          scanCounts={scanCounts}
          projects={projects}
          projectLangs={projectLangs}
          projectBadgeLoading={projectBadgeLoading}
          onSelectScan={(scanId) => navigate(`/security/${scanId}`)}
          onSelectEmpty={(projectId) => navigate(`/security/project/${projectId}`)}
        />
      ) : (
        <div className={cardGridCls}>
          {sortedProjectIds.map((projectId) => {
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
                scanCount={scanCounts[projectId] ?? projectScans.length}
                badges={projectLangs[projectId]}
                badgeLoading={projectBadgeLoading.has(projectId)}
                onSelect={(scanId) => navigate(`/security/${scanId}`)}
              />
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <Pagination
          total={pagination.total}
          limit={pagination.limit}
          offset={pagination.offset}
          onPageChange={goToPage}
        />
      </div>
    </div>
  );
}
