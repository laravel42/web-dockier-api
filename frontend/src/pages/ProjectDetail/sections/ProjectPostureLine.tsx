import { Link } from "react-router-dom";
import type { Deployment, Project, Provider } from "@/types";
import ProviderBadge from "@/components/ProviderBadge";
import ServiceBadge from "@/components/ServiceBadge";
import { getDeployServiceLabel } from "@/utils/deployService";
import { getProviderStyle } from "@/data/providers";
import {
  TONE_CLASS,
  deployClause,
  infraClause,
  type Clause,
} from "../postureClauses";

/**
 * Deploy timing and infra join as one chip on the Back-to-Projects row.
 */

const fallbackLinkCls =
  "rounded-sm text-sm underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current";

function ClauseLink({ clause }: { clause: Clause }) {
  return (
    <Link to={`?tab=${clause.tab}`} className={`${TONE_CLASS[clause.tone]} ${fallbackLinkCls}`}>
      {clause.text}
    </Link>
  );
}

export function DeployStatusLink({
  deploys,
  error = "",
  loaded = false,
}: {
  deploys: readonly Deployment[];
  error?: string;
  loaded?: boolean;
}) {
  const deploy = deployClause(deploys, error, loaded);
  if (!deploy) return null;
  return <ClauseLink clause={deploy} />;
}

function resolveInfra(
  project: Project,
  deploys: readonly Deployment[],
  allProviders: readonly Provider[],
) {
  const infra = infraClause(project, deploys);
  const shipped = deploys.find((d) => d.status === "success");
  const providerKey = shipped
    ? allProviders.find((p) => p.id === shipped.providerId)?.provider ?? ""
    : "";
  const serviceLabel = shipped ? getDeployServiceLabel(providerKey, shipped.deployStrategy) : "";
  const showProviderService =
    project.infraState === "live" && Boolean(providerKey || serviceLabel);
  return { infra, providerKey, serviceLabel, shipped, showProviderService };
}

export function InfraStatusLink({
  project,
  deploys,
  allProviders = [],
}: {
  project: Project;
  deploys: readonly Deployment[];
  allProviders?: readonly Provider[];
}) {
  const { infra, providerKey, serviceLabel, shipped, showProviderService } = resolveInfra(
    project,
    deploys,
    allProviders,
  );

  if (showProviderService && shipped) {
    return (
      <Link
        to="?tab=settings"
        aria-label={infra.text}
        className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/40"
      >
        {providerKey ? (
          <ProviderBadge
            provider={providerKey}
            suffix={serviceLabel ? ` · ${serviceLabel}` : undefined}
          />
        ) : (
          <ServiceBadge provider={providerKey} strategy={shipped.deployStrategy} />
        )}
      </Link>
    );
  }

  return <ClauseLink clause={infra} />;
}

/** Deploy timing and provider/service as one h-7 chip, matching Back to Projects. */
export function DeployInfraStatus({
  project,
  deploys,
  allProviders = [],
  error = "",
  loaded = false,
}: {
  project: Project;
  deploys: readonly Deployment[];
  allProviders?: readonly Provider[];
  error?: string;
  loaded?: boolean;
}) {
  const deploy = deployClause(deploys, error, loaded);
  const { infra, providerKey, serviceLabel, shipped, showProviderService } = resolveInfra(
    project,
    deploys,
    allProviders,
  );
  const showInfraBadge = Boolean(showProviderService && shipped);
  if (!deploy && !showInfraBadge && !infra) return null;

  const segmentCls =
    "inline-flex h-full items-center gap-1.5 px-2.5 text-ui transition-colors hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-500/40";

  const providerName = providerKey ? getProviderStyle(providerKey).name || providerKey.toUpperCase() : "";
  const infraLabel = [providerName, serviceLabel].filter(Boolean).join(" · ");

  return (
    <span className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border/60 bg-card/40">
      {deploy && (
        <Link to="?tab=deployments" className={`${segmentCls} ${TONE_CLASS[deploy.tone]}`}>
          {deploy.text}
        </Link>
      )}
      {deploy && (showInfraBadge || infra) && (
        <span className="w-px self-stretch bg-border/50" aria-hidden />
      )}
      {showInfraBadge && shipped ? (
        <Link to="?tab=settings" aria-label={infra.text} className={`${segmentCls} text-text`}>
          {providerKey ? (
            <ProviderBadge provider={providerKey} showName={false} iconSize="size-3.5" />
          ) : null}
          <span className="whitespace-nowrap">{infraLabel || serviceLabel}</span>
        </Link>
      ) : (
        <Link to="?tab=settings" className={`${segmentCls} ${TONE_CLASS[infra.tone]}`}>
          {infra.text}
        </Link>
      )}
    </span>
  );
}

