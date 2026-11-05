/**
 * Read-only audit: what Bearer/CodeQL data exists before removing those engines.
 *
 * Answers D2/D3 of `plan: eliminar Bearer y CodeQL`. Three things decide whether
 * that plan needs a data migration at all:
 *
 *   1. findings rows whose rule_id names a removed engine. These do not vanish
 *      when the provider leaves the enum — findingProvider() falls through to
 *      its `return "semgrep"` default, so they would show up ATTRIBUTED TO
 *      SEMGREP, which is worse than missing.
 *   2. engine_settings rows configuring an engine that no longer exists.
 *   3. scans.engine_status keys, which are a historical record and stay either
 *      way; counted here only so the number is known rather than assumed.
 *
 * Raw SQL rather than the Supabase client because split_part and
 * jsonb_object_keys have no PostgREST equivalent. Follows the pg.Client +
 * getPostgresConnectionConfig pattern of domain/scan-queue-reconcile.ts.
 *
 * SELECT only. Safe to run against production, and deliberately so: the point
 * is to replace a guess with a number before anything is deleted.
 */
import pg from "pg";

import { initConfig } from "../shared/config.js";
import { getPostgresConnectionConfig } from "../shared/database/postgres.js";
import { getErrMsg } from "../shared/utils/error-message.js";

const REMOVED_ENGINES = ["bearer", "codeql"];

interface Check {
  label: string;
  sql: string;
  params?: unknown[];
  /** What a non-empty result means for the removal plan. */
  verdict: (rows: Record<string, unknown>[]) => string;
}

const CHECKS: Check[] = [
  {
    label: "findings con rule_id de un motor eliminado",
    sql: `SELECT split_part(rule_id, '.', 1) AS prefix, count(*)::int AS rows
          FROM findings
          WHERE rule_id LIKE 'bearer.%' OR rule_id LIKE 'codeql.%'
          GROUP BY 1 ORDER BY 2 DESC`,
    verdict: (rows) =>
      rows.length === 0
        ? "Nada que migrar. El plan no necesita tocar findings."
        : "HAY FILAS. Sin migración acabarían contadas como Semgrep. Decidir: reescribir 'bearer.' → 'sonar.' y borrar las 'codeql.'.",
  },
  {
    label: "engine_settings de motores eliminados",
    sql: `SELECT engine, count(*)::int AS rows
          FROM engine_settings
          WHERE engine = ANY($1::text[])
          GROUP BY 1 ORDER BY 1`,
    params: [REMOVED_ENGINES],
    verdict: (rows) =>
      rows.length === 0
        ? "Nada que borrar. El DELETE de la migración sería un no-op (déjalo igual: es idempotente y documenta la intención)."
        : "HAY FILAS. El DELETE de la migración las limpia.",
  },
  {
    label: "scans.engine_status — claves por motor",
    sql: `SELECT jsonb_object_keys(engine_status) AS engine, count(*)::int AS scans
          FROM scans
          WHERE engine_status <> '{}'
          GROUP BY 1 ORDER BY 2 DESC`,
    verdict: (rows) => {
      const removed = rows.filter((r) => REMOVED_ENGINES.includes(String(r.engine)));
      if (rows.length === 0) return "Ningún scan tiene engine_status. Lo escribe solo el pipeline Python, así que esto confirma que nunca corrió.";
      if (removed.length === 0) return "Ningún scan registró los motores eliminados.";
      return "Hay scans con estos motores en su historial. Se quedan: es registro histórico, no configuración.";
    },
  },
];

/** Render rows as a small aligned table, or say there were none. */
function printRows(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log("    (0 filas)");
    return;
  }
  const columns = Object.keys(rows[0]);
  const width = (col: string) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length));
  const widths = Object.fromEntries(columns.map((c) => [c, width(c)]));
  const line = (cells: string[]) =>
    "    " + cells.map((cell, i) => cell.padEnd(widths[columns[i]])).join("  ");

  console.log(line(columns));
  console.log("    " + columns.map((c) => "-".repeat(widths[c])).join("  "));
  for (const row of rows) {
    console.log(line(columns.map((c) => String(row[c] ?? ""))));
  }
}

async function main(): Promise<void> {
  const env = await initConfig();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada — añádela al .env de la raíz");
  }

  const client = new pg.Client(getPostgresConnectionConfig(env.DATABASE_URL));
  await client.connect();

  try {
    for (const check of CHECKS) {
      console.log(`\n── ${check.label}`);
      try {
        const { rows } = await client.query<Record<string, unknown>>(check.sql, check.params);
        printRows(rows);
        console.log(`    → ${check.verdict(rows)}`);
      } catch (err) {
        // A missing table is itself an answer (engine_settings only exists from
        // migration 0066), so one failed check must not hide the others.
        console.log(`    ! consulta fallida: ${getErrMsg(err)}`);
      }
    }
  } finally {
    await client.end();
  }
  console.log();
}

main().catch((err: unknown) => {
  console.error(`[audit-engine-data] ${getErrMsg(err)}`);
  process.exit(1);
});
