/**
 * One-off backfill: encrypt git PATs and provider credentials already stored in
 * the clear (migration 0077 only adds the columns).
 *
 * This cannot be done in SQL: the AES-256-GCM key lives in ENV_ENCRYPTION_KEY
 * inside this process, not in Postgres. Idempotent — the filters only match
 * rows that still have no encrypted copy.
 */

import { initConfig } from "../shared/config.js";
import { encryptJson } from "../shared/auth/crypto.js";
import { supabaseAdmin } from "../shared/supabase/client.js";
import { getErrMsg } from "../shared/utils/error-message.js";

async function backfillGitConnections(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("git_connections")
    .select("id,personal_token")
    .is("personal_token_encrypted", null)
    .neq("personal_token", "");
  if (error) throw new Error(`Failed to list git_connections: ${error.message}`);

  let migrated = 0;
  for (const row of data ?? []) {
    const { error: updateError } = await supabaseAdmin
      .from("git_connections")
      .update({ personal_token_encrypted: encryptJson(row.personal_token), personal_token: "" })
      .eq("id", row.id);
    if (updateError) throw new Error(`Failed to encrypt git_connection ${row.id}: ${updateError.message}`);
    migrated += 1;
  }
  return migrated;
}

async function backfillServerProviders(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("id,credentials")
    .is("credentials_encrypted", null);
  if (error) throw new Error(`Failed to list server_providers: ${error.message}`);

  let migrated = 0;
  for (const row of data ?? []) {
    const { error: updateError } = await supabaseAdmin
      .from("server_providers")
      .update({ credentials_encrypted: encryptJson(row.credentials), credentials: {} })
      .eq("id", row.id);
    if (updateError) throw new Error(`Failed to encrypt server_provider ${row.id}: ${updateError.message}`);
    migrated += 1;
  }
  return migrated;
}

async function main(): Promise<void> {
  await initConfig();

  const connections = await backfillGitConnections();
  const providers = await backfillServerProviders();

  console.log(`git_connections encrypted: ${connections}`);
  console.log(`server_providers encrypted: ${providers}`);
  console.log("Backfill completed. Re-run is a no-op.");
}

main().catch((err: unknown) => {
  console.error(`Backfill failed: ${getErrMsg(err)}`);
  process.exit(1);
});
