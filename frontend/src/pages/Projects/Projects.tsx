import ConfirmModal from "../../components/ConfirmModal";
import { useProjects } from "./useProjects";
import { btnPrimary } from "./constants";
import ProjectFormModal from "./sections/ProjectFormModal";
import ProjectTable from "./sections/ProjectTable";
import ProjectCard from "./sections/ProjectCard";
import GridIcon from "../../components/icons/outlined/GridIcon";
import Bars3Icon from "../../components/icons/outlined/Bars3Icon";
import PlusIcon from "../../components/icons/outlined/PlusIcon";

export default function Projects() {
  const {
    navigate,
    projects, loading,
    showForm, editing, form, setForm,
    deleteId, setDeleteId,
    viewMode, changeViewMode,
    sourceType, setSourceType,
    selectedTemplate, setSelectedTemplate,
    connections, selectedConnectionId, setSelectedConnectionId,
    repos, selectedRepo, setSelectedRepo,
    branches, selectedBranch, setSelectedBranch,
    loadingRepos, loadingBranches, loadingConnections,
    refreshRepos, refreshingRepos,
    error, submitting,
    openCreate, closeForm, handleSubmit,
    confirmDelete,
    deployments, projectLangs,
  } = useProjects();

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Projects</h1>
        <div className="flex items-center gap-2">
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
          <button onClick={openCreate} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <PlusIcon />
            New Project
          </button>
        </div>
      </div>

      {/* Create / Edit modal */}
      <ProjectFormModal
        open={showForm}
        editing={!!editing}
        form={form}
        onFormChange={setForm}
        onClose={closeForm}
        onSubmit={handleSubmit}
        sourceType={sourceType}
        onSourceTypeChange={setSourceType}
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
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

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <p className="text-text-muted text-center py-12 text-sm">No projects yet. Create one to get started.</p>
      ) : viewMode === "table" ? (
        <ProjectTable
          projects={projects}
          deployments={deployments}
          projectLangs={projectLangs}
          onSelect={(id) => navigate(`/projects/${id}`)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              deployments={deployments}
              badges={projectLangs[p.id]}
              onSelect={(id) => navigate(`/projects/${id}`)}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        message="Are you sure you want to delete this project?"
      />
    </div>
  );
}
