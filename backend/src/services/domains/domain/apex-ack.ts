/**
 * Apex acknowledgements: hostnames the user has confirmed their DNS provider
 * can serve from a zone root via ALIAS, ANAME or CNAME flattening.
 *
 * Stored in the existing `projects.settings` JSONB rather than a new column.
 * `projectSettingsSchema` is `.passthrough()`, so no schema change and no
 * migration — and `settings` already carries the per-project deploy-hook token
 * and `deployTarget`, so the precedent is established.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { normalizeHost } from "./static/apex.js";

const SETTINGS_KEY = "apexAliasAck";

async function readSettings(
  projectId: string,
  tenantId: string,
): Promise<{ ok: boolean; settings: Record<string, unknown> }> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("settings")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, projectId }, "[domains:apex-ack] could not read project settings");
    return { ok: false, settings: {} };
  }
  return { ok: true, settings: (data?.settings as Record<string, unknown> | null) ?? {} };
}

function ackList(settings: Record<string, unknown>): string[] {
  const raw = settings[SETTINGS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

/**
 * Read-modify-write, the same shape `updateProject` already uses for this
 * column, so there is exactly one merge rule for `projects.settings`.
 *
 * KNOWN RACE, accepted: a concurrent write to a DIFFERENT settings key can be
 * lost, because the merge spreads a freshly-read object. The window is
 * milliseconds and the colliding writers are a project-settings save and a
 * deploy, neither plausibly concurrent with an interactive domain add. The
 * mitigation if it ever matters is a server-side `jsonb_set` through the bare
 * `pg.Client` seam that `shared/database/migration-state.ts` already
 * establishes — deliberately not done now, because it would add a second write
 * path for this column to avoid a race nobody has hit.
 */
async function writeAckList(
  projectId: string,
  tenantId: string,
  mutate: (current: string[]) => string[],
): Promise<boolean> {
  const read = await readSettings(projectId, tenantId);
  if (!read.ok) return false;

  const next = mutate(ackList(read.settings));

  const { error } = await supabaseAdmin
    .from("projects")
    .update({ settings: { ...read.settings, [SETTINGS_KEY]: next } })
    .eq("id", projectId)
    .eq("organization_id", tenantId);

  if (error) {
    logger.error({ err: error, projectId }, "[domains:apex-ack] could not write project settings");
    return false;
  }
  return true;
}

/** Record that `host` may be served from its zone root. */
export async function appendApexAck(
  tenantId: string,
  projectId: string,
  host: string,
): Promise<boolean> {
  const name = normalizeHost(host);
  return await writeAckList(projectId, tenantId, (current) => [...new Set([...current, name])]);
}

/**
 * Forget an acknowledgement, so delete-and-re-add shows the explanation again.
 *
 * Without the prune an unacknowledged list would silently re-accept a domain
 * the user removed precisely because it did not work — suppressing the
 * explanation this feature exists to give.
 */
export async function removeApexAck(
  tenantId: string,
  projectId: string,
  host: string,
): Promise<boolean> {
  const name = normalizeHost(host);
  return await writeAckList(projectId, tenantId, (current) => current.filter((h) => h !== name));
}

/** Whether `host` has been acknowledged for this project. */
/**
 * Every acknowledged hostname for this project.
 *
 * Fails closed to `[]`, like the settings read in `static/cloud.ts`: an
 * unreadable list means the reconcile refuses an apex it cannot confirm, which
 * is recoverable, rather than attaching one it has no record of.
 */
export async function listApexAcks(tenantId: string, projectId: string): Promise<string[]> {
  const read = await readSettings(projectId, tenantId);
  if (!read.ok) return [];
  return ackList(read.settings);
}
