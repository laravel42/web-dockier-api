import { btnSecondary, cardCls } from "../../utils/styles";
import { useSecurityScans } from "./useSecurityScans";
import ScanProjectCard from "./sections/ScanProjectCard";
import EmptyProjectCard from "./sections/EmptyProjectCard";
import ShieldCheckIcon from "../../components/icons/outlined/ShieldCheckIcon";

export default function SecurityScans() {
  const {
    navigate,
    loading,
    projects,
    grouped,
    projectLangs,
    sortedProjectIds,
  } = useSecurityScans();

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Security Scans</h1>
        </div>
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (sortedProjectIds.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Security Scans</h1>
        </div>
        <div className={`${cardCls} p-12 text-center`}>
          <ShieldCheckIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <p className="text-sm text-text-muted mb-4">No projects yet. Create a project first to run security scans.</p>
          <button onClick={() => navigate("/projects")} className={btnSecondary}>Go to Projects</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Security Scans</h1>
      </div>
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
    </div>
  );
}
