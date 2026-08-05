import type { Deployment } from "../../../types";
import { strategyLabels, cardCls } from "../../../utils/styles";
import ProviderBadge from "../../../components/ProviderBadge";
import { getProviderStyle } from "../../../data/providers";
import { ExternalLinkIcon } from "lucide-react";

interface Props {
  deploy: Deployment;
  provKey: string;
  deployUrl?: string;
}

export default function InfoCards({ deploy, provKey, deployUrl }: Props) {
  const providerName = getProviderStyle(provKey).name || provKey.toUpperCase();
  const strategyLabel = strategyLabels[deploy.deployStrategy] || deploy.deployStrategy;
  const hasDocker = Boolean(deploy.dockerImage);
  const infrastructureActive = deploy.status === "success";

  const metricCardCls = `${cardCls} px-3 py-2 flex flex-col justify-center text-center min-h-0`;

  if (!deployUrl) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 items-stretch">
        <div className={metricCardCls}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <ProviderBadge provider={provKey} showName={false} iconSize="w-3.5 h-3.5" />
            <p className="text-sm font-semibold text-text">{providerName}</p>
          </div>
          <p className="text-[10px] text-text-muted">Provider</p>
        </div>
        <div className={metricCardCls}>
          <p className="text-sm font-semibold text-text">{strategyLabel}</p>
          <p className="text-[10px] text-text-muted">Strategy</p>
        </div>
        {hasDocker && (
          <div className={metricCardCls}>
            <p className="text-sm font-semibold text-text truncate" title={deploy.dockerImage}>
              {deploy.dockerImage.split("/").pop()?.split(":")[0] || deploy.dockerImage}
            </p>
            <p className="text-[10px] text-text-muted">Docker Image</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 gap-2 mb-6 items-stretch ${hasDocker ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      <div className={metricCardCls}>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <ProviderBadge provider={provKey} showName={false} iconSize="w-3.5 h-3.5" />
          <p className="text-sm font-semibold text-text">{providerName}</p>
        </div>
        <p className="text-[10px] text-text-muted">Provider</p>
      </div>

      <div className={metricCardCls}>
        <p className="text-sm font-semibold text-text">{strategyLabel}</p>
        <p className="text-[10px] text-text-muted">Strategy</p>
      </div>

      <div className={`${metricCardCls} col-span-2`}>
        <a
          href={deployUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex max-w-full items-center justify-center gap-1.5 text-sm font-semibold transition-colors break-all ${
            infrastructureActive
              ? "text-primary-500 hover:text-primary-700"
              : "text-text-muted line-through"
          }`}
        >
          <ExternalLinkIcon className="size-3.5 shrink-0" />
          {deployUrl}
        </a>
        {!infrastructureActive && (
          <p className="text-[10px] text-text-muted mt-1">Infrastructure no longer active.</p>
        )}
      </div>

      {hasDocker && (
        <div className={`${metricCardCls} col-span-2 sm:col-span-1`}>
          <p className="text-sm font-semibold text-text truncate" title={deploy.dockerImage}>
            {deploy.dockerImage.split("/").pop()?.split(":")[0] || deploy.dockerImage}
          </p>
          <p className="text-[10px] text-text-muted">Docker Image</p>
        </div>
      )}
    </div>
  );
}
