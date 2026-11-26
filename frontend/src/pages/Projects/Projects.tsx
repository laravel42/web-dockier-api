import { useMemo } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import PageHeader from "@/components/ui/PageHeader";
import PageError, { EmptyMessage } from "@/components/ui/PageError";
import ListToolbar from "@/components/ui/ListToolbar";
import Pagination from "@/components/ui/Pagination";
import { useProjects } from "./useProjects";
import { useProjectActivity } from "./useProjectActivity";
import { usePermissions } from "@/context/PermissionsContext";
import Button from "@/components/ui/Button";
import ProjectFormModal from "./sections/ProjectFormModal";
import ProjectTable from "./sections/ProjectTable";
import ProjectCard from "./sections/ProjectCard";
import ProjectsSkeleton from "./sections/ProjectsSkeleton";
import { PlusIcon } from "lucide-react";
import { cardGridCls } from "@/utils/styles";

export default function Projects() {
  const { has } = usePermissions();
  const canCreate = has("project:create");
  const canDelete = has("project:delete");
  const {
    navigate,
    projects,
    loading,
    loadError,
    reload,
    showForm,
    openCreate,
    closeForm,
    deleteId,
    setDeleteId,
    viewMode,
    changeViewMode,
    pagination,
    goToPage,
    search,
    handleSearch,
    confirmDelete,
    projectLangs,
    projectBadgeLoading,
    projectFavicons,
  } = useProjects();

  const { deployByProject, scanByProject } = useProjectActivity(projects);

  // Attention-first ordering: projects whose latest completed scan has errors
  // float to the top, then projects whose latest deploy failed, then the rest.
  // Array.sort is stable, so within each group the server order is preserved.
  const orderedProjects = useMemo(() => {
    const rank = (p: (typeof projects)[number]) => {
      if ((scanByProject[p.id]?.latestCompleted?.summary.errors ?? 0) > 0) return 0;
      if (deployByProject[p.id]?.status === "failed") return 1;
      return 2;
    };
    return [...projects].sort((a, b) => rank(a) - rank(b));
  }, [projects, scanByProject, deployByProject]);

  return (
    <div>
      <PageHeader
        title="Projects"
        description={
          loading && projects.length === 0
            ? "Loading repositories…"
            : `${pagination.total} connected ${pagination.total === 1 ? "repository" : "repositories"}`
        }
        actions={
          canCreate ? (
            <Button onClick={openCreate} iconLeft={<PlusIcon className="size-4" />}>
              New Project
            </Button>
          ) : undefined
        }
      />

      <ProjectFormModal
        open={showForm}
        onClose={closeForm}
        onSuccess={reload}
      />

      {loadError && !loading ? (
        <PageError message={loadError} onRetry={reload} />
      ) : !loading && pagination.total === 0 && !search ? (
        <EmptyMessage>No projects yet. Create one to get started.</EmptyMessage>
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={handleSearch}
            searchPlaceholder="Search by name or repository"
            viewMode={viewMode}
            onViewModeChange={changeViewMode}
          />

          {loading ? (
            <ProjectsSkeleton viewMode={viewMode} />
          ) : projects.length === 0 ? (
            <EmptyMessage>No projects match your search.</EmptyMessage>
          ) : viewMode === "table" ? (
            <ProjectTable
              projects={orderedProjects}
              projectLangs={projectLangs}
              projectBadgeLoading={projectBadgeLoading}
              deployByProject={deployByProject}
              scanByProject={scanByProject}
              onSelect={(id) => navigate(`/projects/${id}`)}
            />
          ) : (
            <div className={cardGridCls}>
              {orderedProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  badges={projectLangs[p.id]}
                  badgeLoading={projectBadgeLoading.has(p.id)}
                  repoFaviconUrl={projectFavicons[p.id]}
                  deploy={deployByProject[p.id]}
                  scan={scanByProject[p.id]}
                  onSelect={(id) => navigate(`/projects/${id}`)}
                  onOpenSecurity={(id) => navigate(`/security/project/${id}`)}
                />
              ))}
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
        </>
      )}

      {canDelete && (
        <ConfirmModal
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDelete}
          message="Are you sure you want to delete this project?"
        />
      )}
    </div>
  );
}
