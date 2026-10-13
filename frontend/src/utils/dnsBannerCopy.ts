import type { InfraState } from "@/types";

export interface DnsBannerCopy {
  show: boolean;
  text: string;
}

// Pure copy selection for the Domains-tab DNS reminder. `infraState` is
// optional; an unknown state shows nothing rather than guessing.
export function dnsBannerCopy(
  infraState: InfraState | undefined,
  hasDomains: boolean,
): DnsBannerCopy {
  if (!hasDomains) return { show: false, text: "" };
  switch (infraState) {
    case "torn_down":
      return {
        show: true,
        text: "This project's infrastructure was torn down. Redeploying gives it a new server address, so after the deploy you need to update each domain's DNS record to point at the new address. Until you do, the site and its HTTPS certificate will not work. Use Verify DNS on a domain to see the current server address.",
      };
    case "none":
      return {
        show: true,
        text: "These domains activate the first time you deploy. After deploying, point each domain's DNS record at the server address shown here, then use Verify DNS to confirm it resolves.",
      };
    case "live":
      return {
        show: true,
        text: "If you just redeployed, confirm each domain's DNS record still points at the current server address. Use Verify DNS on a domain to check it.",
      };
    default:
      return { show: false, text: "" };
  }
}
