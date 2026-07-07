import { useMemo, useState } from "react";
import ConfirmModal from "../../components/ConfirmModal";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import ListToolbar from "../../components/ui/ListToolbar";
import { useProjects } from "./useProjects";
import { btnPrimary } from "../../utils/styles";
import { usePermissions } from "../../context/PermissionsContext";
import { getRepoSlug } from "../../utils/parseOwnerRepo";
import { compareByTime } from "../../utils/sortByTime";
import ProjectFormModal from "./sections/ProjectFormModal";
import ProjectTable from "./sections/ProjectTable";
import ProjectCard from "./sections/ProjectCard";
import PlusIcon from "../../components/icons/outlined/PlusIcon";

export default function Projects() {
  const { has } = usePermissions();
  const canCreate = has("project:create");
  const canDelete = has("project:delete");
  const [search, setSearch] = useState("");
  const {
    navigate,
    projects,
    loading,
    loadError,
    reload,
    showForm,
    editing,
    form,
    setForm,
    deleteId,
    setDeleteId,
    viewMode,
    changeViewMode,
    platform,
    setPlatform,
    connections,
    selectedConnectionId,
    setSelectedConnectionId,
    repos,
    selectedRepo,
    setSelectedRepo,
    branches,
    selectedBranch,
    setSelectedBranch,
    loadingRepos,
    loadingBranches,
    loadingConnections,
    refreshRepos,
    refreshingRepos,
    error,
    submitting,
    openCreate,
    closeForm,
    handleSubmit,
    confirmDelete,
    projectLangs,
    projectBadgeLoading,
  } = useProjects();

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects
      .filter((p) => {
        const repo = p.repository ? getRepoSlug(p.repository).toLowerCase() : "";
        return p.name.toLowerCase().includes(q) || repo.includes(q);
      })
      .sort((a, b) => compareByTime(a, b, "created"));
  }, [projects, search]);

  return (
    <div>
      <PageHeader
        title="Projects"
        description={`${projects.length} connected ${projects.length === 1 ? "repository" : "repositories"}`}
        actions={
          canCreate ? (
            <button onClick={openCreate} className={`${btnPrimary} inline-flex items-center gap-2`}>
              <PlusIcon className="size-4" />
              New Project
            </button>
          ) : undefined
        }
      />

      <ProjectFormModal
        open={showForm}
        editing={!!editing}
        form={form}
        onFormChange={setForm}
        onClose={closeForm}
        onSubmit={handleSubmit}
        platform={platform}
        onPlatformChange={setPlatform}
        connections={connections}
        selectedConnectionId={selectedConnectionId}
        onConnectionChange={setSelectedConnectionId}
        loadingConnections={loadingConnections}
        repos={repos}
        selectedRepo={selectedRepo}
        onRepoChange={(val) => {
          setSelectedRepo(val);
          if (!form.name && val) {
            const repo = repos.find((r) => r.fullName === val);
            if (repo) setForm((f) => ({ ...f, name: repo.name }));
          }
        }}
        loadingRepos={loadingRepos}
        onRefreshRepos={refreshRepos}
        refreshingRepos={refreshingRepos}
        submitting={submitting}
        branches={branches}
        selectedBranch={selectedBranch}
        onBranchChange={setSelectedBranch}
        loadingBranches={loadingBranches}
        error={error}
      />

      {loading ? (
        <PageLoading />
      ) : loadError ? (
        <PageError message={loadError} onRetry={reload} />
      ) : projects.length === 0 ? (
        <EmptyMessage>No projects yet. Create one to get started.</EmptyMessage>
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name or repository"
            viewMode={viewMode}
            onViewModeChange={changeViewMode}
          />

          {filteredProjects.length === 0 ? (
            <EmptyMessage>No projects match your search.</EmptyMessage>
          ) : viewMode === "table" ? (
            <ProjectTable
              projects={filteredProjects}
              projectLangs={projectLangs}
              projectBadgeLoading={projectBadgeLoading}
              onSelect={(id) => navigate(`/projects/${id}`)}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  badges={projectLangs[p.id]}
                  badgeLoading={projectBadgeLoading.has(p.id)}
                  onSelect={(id) => navigate(`/projects/${id}`)}
                />
              ))}
            </div>
          )}
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
