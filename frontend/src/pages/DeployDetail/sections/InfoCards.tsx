import type { Deployment } from "../types";
import { strategyLabels } from "../constants";
import { cardCls } from "../../../utils/styles";
import ProviderBadge from "../../../components/ProviderBadge";

interface Props {
  deploy: Deployment;
  provKey: string;
  providerStyle: { text: string };
}

export default function InfoCards({ deploy, provKey, providerStyle }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
      <div className={`${cardCls} px-3 py-2 text-center`}>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <ProviderBadge
            provider={provKey}
            showName={false}
            iconSize="w-3.5 h-3.5"
          />
          <p className={`text-sm font-bold ${providerStyle.text}`}>{provKey.toUpperCase()}</p>
        </div>
        <p className="text-[10px] text-text-muted">Provider</p>
      </div>
      <div className={`${cardCls} px-3 py-2 text-center`}>
        <p className="text-sm font-bold text-text">{strategyLabels[deploy.deployStrategy] || deploy.deployStrategy}</p>
        <p className="text-[10px] text-text-muted">Strategy</p>
      </div>
      {deploy.appUrl && (
        <div className={`${cardCls} px-3 py-2 text-center`}>
          <a
            href={deploy.appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-primary-500 hover:text-primary-700 transition-colors truncate block"
          >
            {deploy.appUrl.replace(/^https?:\/\//, "").slice(0, 25)}
          </a>
          <p className="text-[10px] text-text-muted">App URL</p>
        </div>
      )}
      {deploy.dockerImage && (
        <div className={`${cardCls} px-3 py-2 text-center`}>
          <p className="text-sm font-bold text-text truncate" title={deploy.dockerImage}>{deploy.dockerImage.split("/").pop()?.split(":")[0] || deploy.dockerImage}</p>
          <p className="text-[10px] text-text-muted">Docker Image</p>
        </div>
      )}
    </div>
  );
}
