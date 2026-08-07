import type { Deployment, Provider } from "@/types";
import {
  cardCls,
  getStatusDotClass,
  sidebarHistoryItemCls,
  sidebarHistoryLabelCls,
  sidebarPanelHeadCls,
  sidebarPanelHeadTitleCls,
} from "@/utils/styles";
import { usePermissions } from "@/context/PermissionsContext";
import Button from "@/components/ui/Button";
import ProviderBadge from "@/components/ProviderBadge";
import BranchBadge from "@/components/BranchBadge";
import RocketIcon from "@/components/icons/outlined/RocketIcon";
import Spinner from "@/components/Spinner";

interface Props {
  deploys: Deployment[];
  providers: Provider[];
  activeDeployId: string | undefined;
  loading: boolean;
  fallbackCommitHash?: string;
  canLaunchDeploy?: boolean;
  onNewDeploy?: () => void;
  onSelect: (id: string) => void;
}

export default function DeployHistory({
  deploys,
  providers,
  activeDeployId,
  loading,
  fallbackCommitHash,
  canLaunchDeploy = false,
  onNewDeploy,
  onSelect,
}: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canDeploy = has("deploy:create") && canLaunchDeploy && Boolean(onNewDeploy);

  return (
    <div className="w-72 shrink-0">
      <div className="sticky top-6 space-y-2">
        <div className={`${cardCls} overflow-hidden`}>
          {canDeploy && (
            <div className="p-2 border-b border-border/40">
              <Button
                onClick={onNewDeploy}
                disabled={permissionsLoading}
                iconLeft={<RocketIcon className="size-3.5" />}
                className="w-full"
              >
                New deploy
              </Button>
            </div>
          )}

          <div className={sidebarPanelHeadCls}>
            <p className={sidebarPanelHeadTitleCls}>History</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-3.5" />
            </div>
          ) : deploys.length === 0 ? (
            <p className="text-[10px] text-text-muted text-center py-3">No deploys yet</p>
          ) : (
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto divide-y divide-border/40">
              {deploys.map((d) => {
                const isActive = d.id === activeDeployId;
                const dp = providers.find((p) => p.id === d.providerId);
                const dk = dp?.provider || "";
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={d.id}
                    onClick={() => onSelect(d.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(d.id);
                      }
                    }}
                    className={`${sidebarHistoryItemCls(isActive)} w-full px-2.5 py-2 text-left`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`size-2 rounded-full shrink-0 ${getStatusDotClass(d.status)}`} />
                      <span className={`${sidebarHistoryLabelCls(isActive)} truncate`}>
                        {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 ml-3.5">
                      <ProviderBadge provider={dk} />
                      <BranchBadge
                        branch={d.branch}
                        commit={d.commitHash || fallbackCommitHash || undefined}
                        onClick={() => onSelect(d.id)}
                        size="compact"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
