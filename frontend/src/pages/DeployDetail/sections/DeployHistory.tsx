import type { Deployment, Provider } from "../../../types";
import {
  btnPrimary,
  cardCls,
  getStatusDotClass,
  sidebarHistoryItemCls,
  sidebarHistoryLabelCls,
  sidebarPanelHeadCls,
  sidebarPanelHeadTitleCls,
} from "../../../utils/styles";
import { usePermissions } from "../../../context/PermissionsContext";
import ProviderBadge from "../../../components/ProviderBadge";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import Spinner from "../../../components/Spinner";

interface Props {
  deploys: Deployment[];
  providers: Provider[];
  activeDeployId: string | undefined;
  loading: boolean;
  canLaunchDeploy?: boolean;
  onNewDeploy?: () => void;
  onSelect: (id: string) => void;
}

export default function DeployHistory({
  deploys,
  providers,
  activeDeployId,
  loading,
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
              <button
                type="button"
                onClick={onNewDeploy}
                disabled={permissionsLoading}
                className={`${btnPrimary} w-full py-2 text-sm`}
              >
                <RocketIcon className="size-3.5" />
                New deploy
              </button>
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
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
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
                      <span className="text-[10px] text-text-muted truncate">{d.branch}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
