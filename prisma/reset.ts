/**
 * Drop all tables, re-run migrations, then seed.
 *
 * Usage: npx tsx prisma/reset.ts
 */
import pg from "pg";
import { readdirSync, readFileSync, createReadStream } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { from as copyFrom } from "pg-copy-streams";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/dockier";

async function seedCsv(client: pg.Client, table: string, csvPath: string) {
  const stream = client.query(copyFrom(`COPY ${table} FROM STDIN WITH (FORMAT csv, HEADER true)`));
  const fileStream = createReadStream(csvPath);
  await pipeline(fileStream, stream);
  const after = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  console.log(`  ✓ ${table}: ${after.rows[0].n} rows`);
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Drop and recreate schema
  console.log("Dropping all tables...");
  await client.query("DROP SCHEMA public CASCADE");
  await client.query("CREATE SCHEMA public");
  console.log("  ✓ Schema reset\n");

  // Run migrations
  const migrationsDir = join(import.meta.dirname, "migrations");
  const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  console.log(`Running ${migrationFiles.length} migrations...`);
  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (e: any) {
      console.error(`  ✗ ${file}: ${e.message}`);
    }
  }

  // Run SQL seeders
  const seedersDir = join(import.meta.dirname, "seeders");
  const sqlFiles = readdirSync(seedersDir).filter(f => f.endsWith(".sql")).sort();
  console.log(`\nRunning SQL seeders...`);
  for (const file of sqlFiles) {
    const sql = readFileSync(join(seedersDir, file), "utf-8");
    if (sql.includes("placeholder")) { continue; }
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (e: any) {
      console.error(`  ✗ ${file}: ${e.message}`);
    }
  }

  // Run CSV seeders
  const csvFiles = readdirSync(seedersDir).filter(f => f.endsWith(".csv")).sort();
  if (csvFiles.length > 0) {
    console.log(`\nRunning CSV seeders...`);
    for (const file of csvFiles) {
      const table = file.replace(/^\d+_seed_/, "").replace(".csv", "");
      try {
        await seedCsv(client, table, join(seedersDir, file));
      } catch (e: any) {
        console.error(`  ✗ ${file}: ${e.message}`);
      }
    }
  }

  await client.end();
  console.log("\nReset complete!");
}

main().catch((e) => { console.error(e); process.exit(1); });
