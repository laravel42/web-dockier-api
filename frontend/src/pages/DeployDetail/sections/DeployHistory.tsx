import type { Deployment, Provider } from "../../../types";
import {
  cardCls,
  getStatusDotClass,
  sidebarHistoryItemCls,
  sidebarHistoryLabelCls,
  sidebarPanelHeadCls,
  sidebarPanelHeadTitleCls,
} from "../../../utils/styles";
import ProviderBadge from "../../../components/ProviderBadge";
import Spinner from "../../../components/Spinner";

interface Props {
  deploys: Deployment[];
  providers: Provider[];
  activeDeployId: string | undefined;
  loading: boolean;
  onSelect: (id: string) => void;
}

export default function DeployHistory({ deploys, providers, activeDeployId, loading, onSelect }: Props) {
  return (
    <div className="w-80 shrink-0">
      <div className="sticky top-6 space-y-3">
        <div className={`${cardCls} overflow-hidden`}>
          <div className={sidebarPanelHeadCls}>
            <p className={sidebarPanelHeadTitleCls}>Deploy History</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4" />
            </div>
          ) : deploys.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No deploys yet</p>
          ) : (
            <div className="max-h-[calc(100vh-180px)] overflow-y-auto divide-y divide-border/50">
              {deploys.map((d) => {
                const isActive = d.id === activeDeployId;
                const dp = providers.find((p) => p.id === d.providerId);
                const dk = dp?.provider || "";
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    className={`${sidebarHistoryItemCls(isActive)} px-3 py-2.5`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full shrink-0 ${getStatusDotClass(d.status)}`} />
                      <span className={sidebarHistoryLabelCls(isActive, "xs")}>
                        {new Date(d.createdAt).toLocaleDateString()}{" "}
                        {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 ml-4">
                      <ProviderBadge provider={dk} />
                      <span className="text-[10px] text-text-muted">{d.branch}</span>
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
