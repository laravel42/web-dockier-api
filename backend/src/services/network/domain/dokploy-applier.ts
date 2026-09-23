/**
 * Network Rules Applier — Dokploy strategy
 *
 * Applies the project's security (HTTP Basic Auth) and redirect rules to a
 * Dokploy-deployed application by reconciling Dokploy's per-app Traefik
 * middlewares to match our DB:
 *   - security rules → Dokploy `security.create` (BasicAuth middleware)
 *   - redirect rules → Dokploy `redirect.create` (redirect-regex rule)
 *
 * This is the Dokploy counterpart to the nginx applier (applier.ts). It's
 * selected by applyNetworkRules() when the project is a Dokploy deployment
 * (i.e. it has a dokploy_applications mapping). The legacy AWS/nginx path is
 * unchanged.
 *
 * Reconciliation strategy: read what Dokploy currently has, delete all existing
 * security + redirect entries for the app, then recreate from our DB. This
 * mirrors the "regenerate the whole config" model of the nginx applier and
 * avoids drift from partial updates. It's idempotent.
 */

import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { createDokployClient } from "../../deploy/domain/dokploy/client.js";
import { getApplication } from "../../deploy/domain/dokploy/mappings.js";
import { listRedirectRules, listSecurityRulesWithSecrets } from "./network.js";
import type { RedirectRuleResponse } from "./mappers.js";

export interface ApplyResult {
  success: boolean;
  message: string;
  /** For parity with the nginx applier (unused here, kept for the shared shape). */
  generatedConfig?: string;
}

/**
 * Whether a project is deployed via Dokploy (has an application mapping).
 * Used by applyNetworkRules to pick the strategy.
 */
export async function isDokployProject(projectId: string): Promise<boolean> {
  try {
    const app = await getApplication(projectId);
    return Boolean(app?.dokployApplicationId);
  } catch {
    return false;
  }
}

/**
 * Convert a stored redirect rule (fromPath/toPath + type) into Dokploy's
 * regex/replacement/permanent shape for a Traefik `redirectRegex` middleware.
 *
 * IMPORTANT: Traefik's redirectRegex matches the FULL request URL
 * (scheme://host/path), NOT just the path. A path-only pattern like `^/old$`
 * never matches (the URL starts with `http://host…`), which is why a naive
 * `^<path>$` silently does nothing. So we match the whole URL, capturing the
 * scheme+host so we can preserve it, and swap only the path:
 *
 *   fromPath "/old"  → regex `^(https?://[^/]+)/old$`
 *   toPath   "/new"  → replacement `$1/new`   (keeps same scheme + host)
 *   type "permanent" → permanent true (HTTP 301), else false (302)
 *
 * If toPath is an absolute URL (http/https), we redirect to it as-is (external
 * redirect) rather than prefixing the original host. Regex-special characters
 * in the incoming path are escaped so it matches literally.
 */
export function redirectToDokploy(rule: RedirectRuleResponse): { regex: string; replacement: string; permanent: boolean } {
  const fromPath = rule.fromPath.startsWith("/") ? rule.fromPath : `/${rule.fromPath}`;
  const escapedFrom = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = `^(https?://[^/]+)${escapedFrom}$`;

  const toIsAbsolute = /^https?:\/\//i.test(rule.toPath);
  const replacement = toIsAbsolute
    ? rule.toPath // external redirect — go to the absolute URL as given
    : `$1${rule.toPath.startsWith("/") ? rule.toPath : `/${rule.toPath}`}`; // same host, new path

  return {
    regex,
    replacement,
    permanent: rule.type === "permanent",
  };
}

/**
 * Apply all network rules for a Dokploy project by reconciling its Traefik
 * middlewares. Never throws — returns an ApplyResult (matches the nginx
 * applier's contract so the worker/pipeline treat both the same).
 */
export async function applyNetworkRulesDokploy(params: {
  tenantId: string;
  projectId: string;
}): Promise<ApplyResult> {
  const { tenantId, projectId } = params;

  try {
    const app = await getApplication(projectId);
    if (!app?.dokployApplicationId) {
      return { success: true, message: "No Dokploy application yet. Rules will be applied on next deployment." };
    }
    const applicationId = app.dokployApplicationId;

    const [securityRules, redirectRules] = await Promise.all([
      listSecurityRulesWithSecrets({ tenantId, projectId }),
      listRedirectRules({ tenantId, projectId }),
    ]);

    const client = createDokployClient();

    // 1. Read existing middlewares and clear them (full reconcile).
    const existing = await client.listAppMiddlewares(applicationId);
    for (const s of existing.security) {
      if (s.securityId) await client.deleteSecurity(s.securityId).catch((e) => {
        logger.warn({ err: getErrMsg(e), securityId: s.securityId }, "[network:dokploy] failed to delete security entry");
      });
    }
    for (const r of existing.redirects) {
      if (r.redirectId) await client.deleteRedirect(r.redirectId).catch((e) => {
        logger.warn({ err: getErrMsg(e), redirectId: r.redirectId }, "[network:dokploy] failed to delete redirect entry");
      });
    }

    // 2. Recreate security (Basic Auth) from our DB — one entry per credential.
    let securityCount = 0;
    let skippedCreds = 0;
    for (const rule of securityRules) {
      if (rule.credentials.length === 0) continue;
      for (const cred of rule.credentials) {
        try {
          await client.createSecurity({ applicationId, username: cred.username, password: cred.password });
          securityCount++;
        } catch (e) {
          skippedCreds++;
          logger.warn({ err: getErrMsg(e), ruleId: rule.id }, "[network:dokploy] failed to create security credential");
        }
      }
    }

    // 3. Recreate redirects from our DB.
    let redirectCount = 0;
    for (const rule of redirectRules) {
      const { regex, replacement, permanent } = redirectToDokploy(rule);
      try {
        await client.createRedirect({ applicationId, regex, replacement, permanent });
        redirectCount++;
      } catch (e) {
        logger.warn({ err: getErrMsg(e), ruleId: rule.id }, "[network:dokploy] failed to create redirect");
      }
    }

    logger.info(
      { projectId, applicationId, securityCount, redirectCount, skippedCreds },
      "[network:dokploy] applied network rules",
    );

    const parts = [`${securityCount} security credential(s)`, `${redirectCount} redirect(s)`];
    let message = `Applied ${parts.join(" and ")} to the deployed application.`;
    if (skippedCreds > 0) {
      message += ` ${skippedCreds} credential(s) were skipped because their password could not be recovered — recreate them.`;
    }
    return { success: true, message };
  } catch (err) {
    const msg = getErrMsg(err);
    logger.error({ err: msg, projectId }, "[network:dokploy] error applying rules");
    return { success: false, message: `Error applying network rules: ${msg}` };
  }
}
