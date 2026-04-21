/**
 * Run all prisma migrations and seeders against the database.
 *
 * Usage: npx tsx prisma/migrate.ts
 *
 * Env: DATABASE_URL (defaults to local postgres)
 */
import pg from "pg";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/dockier";

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

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

  // Run seeders
  const seedersDir = join(import.meta.dirname, "seeders");
  const seederFiles = readdirSync(seedersDir).filter(f => f.endsWith(".sql")).sort();
  console.log(`\nRunning ${seederFiles.length} seeders...`);
  for (const file of seederFiles) {
    const sql = readFileSync(join(seedersDir, file), "utf-8");
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (e: any) {
      console.error(`  ✗ ${file}: ${e.message}`);
    }
  }

  await client.end();
  console.log("\nDone!");
}

main().catch((e) => { console.error(e); process.exit(1); });
