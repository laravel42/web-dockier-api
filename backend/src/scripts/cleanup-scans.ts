import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import { SECURITY_SCAN_QUEUE } from "../shared/queue.js";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(thisFile);
const backendDir = resolve(scriptsDir, "../..");
const workspaceDir = resolve(backendDir, "..");

loadEnv({ path: resolve(workspaceDir, ".env.local"), override: false });
loadEnv({ path: resolve(workspaceDir, ".env"), override: false });
loadEnv({ path: resolve(backendDir, ".env.local"), override: false });
loadEnv({ path: resolve(backendDir, ".env"), override: false });

const dryRun = process.argv.includes("--dry-run");

async function countRows(client: pg.Client, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DIRECT_URL or DATABASE_URL is required (set in .env.local).");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const findings = await countRows(client, "SELECT COUNT(*)::text AS count FROM findings");
    const scans = await countRows(client, "SELECT COUNT(*)::text AS count FROM scans");

    let queueJobs = 0;
    let hasPgboss = true;
    try {
      queueJobs = await countRows(
        client,
        "SELECT COUNT(*)::text AS count FROM pgboss.job WHERE name = $1",
        [SECURITY_SCAN_QUEUE],
      );
    } catch {
      hasPgboss = false;
    }

    console.log("Scan data:");
    console.log(`  findings: ${findings}`);
    console.log(`  scans: ${scans}`);
    console.log(`  pgboss ${SECURITY_SCAN_QUEUE} jobs: ${hasPgboss ? queueJobs : "(pgboss schema not found)"}`);

    if (dryRun) {
      console.log("Dry run — no changes made.");
      return;
    }

    if (findings === 0 && scans === 0 && queueJobs === 0) {
      console.log("Nothing to clean up.");
      return;
    }

    await client.query("BEGIN");
    await client.query("TRUNCATE TABLE findings, scans");

    if (hasPgboss) {
      const deleted = await client.query("DELETE FROM pgboss.job WHERE name = $1", [SECURITY_SCAN_QUEUE]);
      console.log(`Removed ${deleted.rowCount ?? 0} pg-boss job(s).`);
    }

    await client.query("COMMIT");
    console.log("Scan tables cleared.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Cleanup failed: ${message}`);
  process.exit(1);
});
