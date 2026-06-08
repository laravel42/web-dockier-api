import type { Deployment, Provider } from "../../../types";
import { cardCls } from "../../../utils/styles";
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
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Deploy History</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4 " />
            </div>
          ) : deploys.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No deploys yet</p>
          ) : (
            <div className="max-h-[calc(100vh-180px)] overflow-y-auto divide-y divide-border">
              {deploys.map((d) => {
                const isActive = d.id === activeDeployId;
                const dp = providers.find(p => p.id === d.providerId);
                const dk = dp?.provider || "";
                const statusDot = d.status === "success" ? "bg-success-500" : d.status === "failed" ? "bg-danger-500" : d.status === "building" || d.status === "deploying" ? "bg-primary-500" : "bg-secondary-300";
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${isActive ? "bg-primary-50" : "hover:bg-secondary-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`size-2  rounded-full shrink-0 ${statusDot}`} />
                      <span className={`text-xs font-medium truncate ${isActive ? "text-primary-600" : "text-text"}`}>
                        {new Date(d.createdAt).toLocaleDateString()} {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
