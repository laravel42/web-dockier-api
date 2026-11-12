import PageHeader from "@/components/ui/PageHeader";
import PageLoading from "@/components/ui/PageLoading";
import PageError from "@/components/ui/PageError";
import Button from "@/components/ui/Button";
import { useDashboard } from "./useDashboard";
import { usePermissions } from "@/context/PermissionsContext";
import KpiGrid from "./sections/KpiGrid";
import GettingStarted from "./sections/GettingStarted";
import RecentDeploys from "./sections/RecentDeploys";
import RecentScans from "./sections/RecentScans";
import { PlusIcon } from "lucide-react";

export default function Dashboard() {
  const {
    navigate,
    projects,
    providers,
    loading,
    error,
    reload,
    totals,
    totalFindings,
    recentDeploys,
    recentScans,
    projectMap,
    fallbackCommitByProject,
  } = useDashboard();
  const { has, loading: permLoading } = usePermissions();
  const canViewDeploys = has("deploy:view");

  if (loading || permLoading) {
    return <PageLoading />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Overview of your projects, scans, and deployments." />
        <PageError message={error} onRetry={reload} />
      </div>
    );
  }

  if (projects.length === 0) {
    return <GettingStarted navigate={navigate} />;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your projects, scans, and deployments."
        actions={
          <Button
            onClick={() => navigate("/projects", { state: { openCreate: true } })}
            iconLeft={<PlusIcon className="size-4" />}
          >
            New Project
          </Button>
        }
      />

      <KpiGrid
        projects={totals.projects}
        deploys={totals.deploys}
        successDeploys={totals.successDeploys}
        failedDeploys={totals.failedDeploys}
        scans={totals.scans}
        totalFindings={totalFindings}
        showDeploys={canViewDeploys}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canViewDeploys && (
          <RecentDeploys
            deploys={recentDeploys}
            providers={providers}
            projectMap={projectMap}
            fallbackCommitByProject={fallbackCommitByProject}
            onViewAll={() => navigate("/deploy")}
            onViewDeploy={(id) => navigate(`/deploy/${id}`)}
          />
        )}
        <RecentScans
          scans={recentScans}
          projectMap={projectMap}
          fallbackCommitByProject={fallbackCommitByProject}
          onViewAll={() => navigate("/security")}
          onViewScan={(id) => navigate(`/security/${id}`)}
        />
      </div>
    </div>
  );
}
