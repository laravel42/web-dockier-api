import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deployApi } from "@/services/api";
import type { Deployment, Project, Provider } from "@/types";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import ProviderBadge from "@/components/ProviderBadge";
import ServiceBadge from "@/components/ServiceBadge";
import { usePermissions } from "@/context/PermissionsContext";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { getStatusDotClass, statusBadgeColors } from "@/utils/styles";
import Spinner from "@/components/Spinner";

const PAGE_SIZE = 10;

interface Props {
  project: Project;
  providers: Provider[];
}

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

export default function ProjectDeploymentsTab({ project, providers }: Props) {
  const navigate = useNavigate();
  const { has, loading: permissionsLoading } = usePermissions();
  const canView = has("deploy:view");

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDeployments = useCallback(async () => {
    if (!project.id || !canView) return;
    setLoading(true);
    setError("");
    try {
      const res = await deployApi.listDeployments({
        projectId: project.id,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setDeployments(res.deployments);
      setTotal(res.pagination.total);
    } catch {
      setError("Failed to load deployments");
      setDeployments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [project.id, canView, page]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canView) {
      setLoading(false);
      return;
    }
    void loadDeployments();
  }, [permissionsLoading, canView, loadDeployments]);

  if (permissionsLoading) {
    return <TabSpinner label="Loading deployments…" />;
  }

  if (!canView) {
    return (
      <p className="text-sm text-text-muted pb-4 text-center">
        You don&apos;t have permission to view deployments.
      </p>
    );
  }

  if (loading) {
    return <TabSpinner label="Loading deployments…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 pb-6 text-center">
        <p className="text-sm text-danger-500">{error}</p>
        <button
          type="button"
          onClick={() => void loadDeployments()}
          className="text-xs font-medium text-primary hover:text-primary/80"
        >
          Retry
        </button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <p className="text-sm text-text-muted pb-4 text-center">
        No deployments yet for this project.
      </p>
    );
  }

  const providerKey = (providerId: string) =>
    providers.find((p) => p.id === providerId)?.provider || "";

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/50 p-2 scrollbar-hide">
        <div className="space-y-2">
        {deployments.map((deploy) => {
          const pk = providerKey(deploy.providerId);
          const isInactive = deploy.status === "destroyed" || deploy.status === "failed";
          const openDeploy = () => navigate(`/deploy/${deploy.id}`);
          return (
          <div
            key={deploy.id}
            role="button"
            tabIndex={0}
            onClick={openDeploy}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDeploy();
              }
            }}
            className={`flex w-full cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              isInactive
                ? "border-border/30 bg-secondary-50/20 hover:border-border/50 hover:bg-secondary-50/40"
                : "border-border/40 bg-card/30 hover:border-border hover:bg-card/50"
            }`}
          >
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${getStatusDotClass(deploy.status)}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BranchCommitLabel
                  branch={deploy.branch}
                  commit={deploy.commitHash || project.lastCommitHash || undefined}
                  onClick={openDeploy}
                />
                <span
                  className={`rounded px-1.5 py-px text-xs font-medium capitalize ${statusBadgeColors[deploy.status] || "bg-secondary-100 text-text-muted"}`}
                >
                  {deploy.status}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {pk && <ProviderBadge provider={pk} />}
                {deploy.deployStrategy && (
                  <ServiceBadge provider={pk} strategy={deploy.deployStrategy} />
                )}
                <time className="ml-auto text-xs text-text-muted whitespace-nowrap">
                  {formatCardDateTime(deploy.createdAt)}
                </time>
              </div>
            </div>
          </div>
          );
        })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-border/40 pt-3">
          <span className="text-xs text-text-muted">
            {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-7 rounded-md border border-border px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 rounded-md border border-border px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
