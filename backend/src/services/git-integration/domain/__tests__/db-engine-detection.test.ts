import { describe, expect, it } from "vitest";

import { parseDbEngineFromEnvExample } from "../analysis.js";

/**
 * Dockier never reads the user's real `.env`, so the AI used to guess the DB
 * engine — and defaulted a Laravel project to Postgres when its real
 * `DB_CONNECTION=mysql` lived in the unreadable `.env`. The committed
 * `.env.example` carries the intended engine as a real file value; this parser
 * is the authoritative signal that replaces the guess.
 */
describe("parseDbEngineFromEnvExample", () => {
  it("reads DB_CONNECTION from a Laravel .env.example (mysql)", () => {
    const engine = parseDbEngineFromEnvExample({
      ".env.example": "APP_NAME=Laravel\nDB_CONNECTION=mysql\nDB_HOST=127.0.0.1\n",
    });
    expect(engine).toBe("mysql");
  });

  it("reads the Laravel 11+ default (sqlite)", () => {
    const engine = parseDbEngineFromEnvExample({ ".env.example": "DB_CONNECTION=sqlite\n" });
    expect(engine).toBe("sqlite");
  });

  it("reads pgsql", () => {
    const engine = parseDbEngineFromEnvExample({ ".env.example": "DB_CONNECTION=pgsql\n" });
    expect(engine).toBe("pgsql");
  });

  it("matches regardless of the file's path prefix", () => {
    // runRepoAnalysis keys configFiles by the full repo path.
    const engine = parseDbEngineFromEnvExample({ "backend/.env.example": "DB_CONNECTION=mysql\n" });
    expect(engine).toBe("mysql");
  });

  it("lowercases and strips quotes and inline comments", () => {
    expect(
      parseDbEngineFromEnvExample({ ".env.example": 'DB_CONNECTION="MySQL" # the database\n' }),
    ).toBe("mysql");
  });

  it("ignores commented-out lines", () => {
    const engine = parseDbEngineFromEnvExample({
      ".env.example": "# DB_CONNECTION=pgsql\nDB_CONNECTION=mysql\n",
    });
    expect(engine).toBe("mysql");
  });

  it("returns undefined when there is no .env.example", () => {
    expect(parseDbEngineFromEnvExample({ "composer.json": "{}" })).toBeUndefined();
  });

  it("returns undefined when .env.example declares no DB_CONNECTION", () => {
    expect(parseDbEngineFromEnvExample({ ".env.example": "APP_NAME=Laravel\n" })).toBeUndefined();
  });

  it("returns undefined for an empty DB_CONNECTION value", () => {
    expect(parseDbEngineFromEnvExample({ ".env.example": "DB_CONNECTION=\n" })).toBeUndefined();
  });
});
