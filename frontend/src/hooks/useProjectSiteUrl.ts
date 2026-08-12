import { useEffect, useState } from "react";
import { domainsApi } from "@/services/domains";

/**
 * Resolve the public site URL for a project: primary custom domain, else deploy URL.
 * Returns undefined when infrastructure is torn down or no URL is available.
 */
export function useProjectSiteUrl(
  projectId: string | undefined,
  deployUrl?: string,
  infraTornDown = false,
): string | undefined {
  const [domainUrl, setDomainUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!projectId) {
      setDomainUrl(undefined);
      return;
    }

    let cancelled = false;
    setDomainUrl(undefined);

    domainsApi.listDomains(projectId).then((res) => {
      if (cancelled) return;
      const primary = res.domains.find((d) => d.isPrimary) || res.domains[0];
      if (primary) {
        setDomainUrl(`https://${primary.name}`);
      }
    }).catch(() => { /* fall back to deployUrl */ });

    return () => { cancelled = true; };
  }, [projectId]);

  if (infraTornDown) return undefined;
  return domainUrl || deployUrl?.trim() || undefined;
}
