import { btnPrimary } from "../../utils/styles";
import Spinner from "../../components/Spinner";
import { useDashboard } from "./useDashboard";
import PlusIcon from "../../components/icons/outlined/PlusIcon";
import KpiGrid from "./sections/KpiGrid";
import RecentDeploys from "./sections/RecentDeploys";
import RecentScans from "./sections/RecentScans";

export default function Dashboard() {
  const {
    navigate,
    projects, deploys, scans, providers,
    loading,
    successDeploys, failedDeploys, totalFindings,
    recentDeploys, recentScans,
    projectMap,
  } = useDashboard();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Dashboard</h1>
        <button
          onClick={() => navigate("/projects", { state: { openCreate: true } })}
          className={`${btnPrimary} inline-flex items-center gap-2`}
        >
          <PlusIcon className="w-4 h-4" />
          New Project
        </button>
      </div>

      <KpiGrid
        projects={projects.length}
        deploys={deploys.length}
        successDeploys={successDeploys}
        failedDeploys={failedDeploys}
        scans={scans.length}
        totalFindings={totalFindings}
        onNavigate={navigate}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentDeploys
          deploys={recentDeploys}
          providers={providers}
          projectMap={projectMap}
          onViewAll={() => navigate("/deploy")}
          onViewDeploy={(id) => navigate(`/deploy/${id}`)}
        />
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
