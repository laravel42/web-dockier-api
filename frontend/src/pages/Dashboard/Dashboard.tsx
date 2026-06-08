import { btnPrimary } from "../../utils/styles";
import PageHeader from "../../components/ui/PageHeader";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import { useDashboard } from "./useDashboard";
import { usePermissions } from "../../context/PermissionsContext";
import PlusIcon from "../../components/icons/outlined/PlusIcon";
import KpiGrid from "./sections/KpiGrid";
import RecentDeploys from "./sections/RecentDeploys";
import RecentScans from "./sections/RecentScans";

export default function Dashboard() {
  const {
    navigate,
    projects,
    deploys,
    scans,
    providers,
    loading,
    error,
    reload,
    successDeploys,
    failedDeploys,
    totalFindings,
    recentDeploys,
    recentScans,
    projectMap,
  } = useDashboard();
  const { has, loading: permLoading } = usePermissions();
  const canViewDeploys = has("deploy:view");

  if (loading || permLoading) {
    return <PageLoading />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <PageError message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={
          <button
            onClick={() => navigate("/projects", { state: { openCreate: true } })}
            className={`${btnPrimary} inline-flex items-center gap-2`}
          >
            <PlusIcon className="w-4 h-4" />
            New Project
          </button>
        }
      />

      <KpiGrid
        projects={projects.length}
        deploys={deploys.length}
        successDeploys={successDeploys}
        failedDeploys={failedDeploys}
        scans={scans.length}
        totalFindings={totalFindings}
        onNavigate={navigate}
        showDeploys={canViewDeploys}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canViewDeploys && (
          <RecentDeploys
            deploys={recentDeploys}
            providers={providers}
            projectMap={projectMap}
            onViewAll={() => navigate("/deploy")}
            onViewDeploy={(id) => navigate(`/deploy/${id}`)}
          />
        )}
        <RecentScans
          scans={recentScans}
          projectMap={projectMap}
          onViewAll={() => navigate("/security")}
          onViewScan={(id) => navigate(`/security/${id}`)}
        />
      </div>
    </div>
  );
}
