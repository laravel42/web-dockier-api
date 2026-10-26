/**
 * One-off backfill: encrypt git PATs and provider credentials already stored in
 * the clear (migration 0077 only adds the columns).
 *
 * This cannot be done in SQL: the AES-256-GCM key lives in ENV_ENCRYPTION_KEY
 * inside this process, not in Postgres. Idempotent — the filters only match
 * rows that still have no encrypted copy.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { initConfig, env } from "../shared/config.js";
import { encryptJson } from "../shared/auth/crypto.js";
import { resolveSupabaseSecretKey } from "../shared/supabase/keys.js";
import type { Database } from "../shared/supabase/types.js";
import { getErrMsg } from "../shared/utils/error-message.js";

type Db = SupabaseClient<Database>;

async function backfillGitConnections(db: Db): Promise<number> {
  let migrated = 0;

  // Drained in passes, because a single SELECT returns at most PostgREST's
  // default page (1000 rows on Supabase). One pass used to leave every later
  // row in the clear while main() printed "Backfill completed".
  //
  // The filter does the paging: a row this pass encrypts stops matching
  // `personal_token_encrypted is null`, so the next SELECT returns the rows
  // after it — no range()/offset bookkeeping, and no page to skip if a row is
  // deleted mid-run. Terminates because every returned row is either migrated
  // (shrinking the matching set) or throws.
  for (;;) {
    const { data, error } = await db
      .from("git_connections")
      .select("id,personal_token")
      .is("personal_token_encrypted", null)
      .neq("personal_token", "");
    if (error) throw new Error(`Failed to list git_connections: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) return migrated;

    for (const row of rows) {
      const { error: updateError } = await db
        .from("git_connections")
        .update({ personal_token_encrypted: encryptJson(row.personal_token), personal_token: "" })
        .eq("id", row.id);
      if (updateError) throw new Error(`Failed to encrypt git_connection ${row.id}: ${updateError.message}`);
      migrated += 1;
    }
  }
}

async function backfillServerProviders(db: Db): Promise<number> {
  let migrated = 0;

  // Same pass-draining as backfillGitConnections — see the note there.
  for (;;) {
    const { data, error } = await db
      .from("server_providers")
      .select("id,credentials")
      .is("credentials_encrypted", null);
    if (error) throw new Error(`Failed to list server_providers: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) return migrated;

    for (const row of rows) {
      const { error: updateError } = await db
        .from("server_providers")
        .update({ credentials_encrypted: encryptJson(row.credentials), credentials: {} })
        .eq("id", row.id);
      if (updateError) throw new Error(`Failed to encrypt server_provider ${row.id}: ${updateError.message}`);
      migrated += 1;
    }
  }
}

async function main(): Promise<void> {
  await initConfig();

  // Built here, not imported from shared/supabase/client.js: that module calls
  // createClient(env.SUPABASE_URL, ...) at load time, and ESM evaluates imports
  // before this file's body — so importing it threw "Config not initialized"
  // before initConfig() could run. Same approach as seed-admin.ts.
  const db: Db = createClient<Database>(env.SUPABASE_URL, resolveSupabaseSecretKey(env), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const connections = await backfillGitConnections(db);
  const providers = await backfillServerProviders(db);

  console.log(`git_connections encrypted: ${connections}`);
  console.log(`server_providers encrypted: ${providers}`);
  console.log("Backfill completed. Re-run is a no-op.");
}

main().catch((err: unknown) => {
  console.error(`Backfill failed: ${getErrMsg(err)}`);
  process.exit(1);
});
