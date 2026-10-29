/**
 * Databases declared inside a compose stack.
 *
 * This gate decides whether Dockier provisions backing services. A false
 * negative is the expensive one: provisioning a second Postgres and injecting
 * DB_HOST over a working `DATABASE_URL` points the app at the wrong server.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCompose } from "../parse.js";
import { detectComposeDatabases, declaresOwnDatabase } from "../databases.js";

const berry = parseCompose(
  readFileSync(join(import.meta.dirname, "fixtures/berry-dokploy.yml"), "utf8"),
  "deploy/dokploy",
);

const stack = (yaml: string) => parseCompose(yaml, "");

describe("detectComposeDatabases — berry fixture", () => {
  it("finds the stack's own postgres", () => {
    expect(detectComposeDatabases(berry)).toEqual([
      { service: "postgres", engine: "postgres", serviceType: "database", image: "postgres:16" },
    ]);
  });

  it("means Dockier provisions nothing for this project", () => {
    expect(declaresOwnDatabase(berry)).toBe(true);
  });

  it("does not mistake an application service for a database", () => {
    const names = detectComposeDatabases(berry).map((d) => d.service);
    expect(names).not.toContain("api");
    expect(names).not.toContain("web");
  });
});

describe("detectComposeDatabases — image matching", () => {
  const engineOf = (image: string) =>
    detectComposeDatabases(stack(`services:\n  db:\n    image: ${image}\n`))[0]?.engine;

  it("matches the common engines", () => {
    expect(engineOf("postgres:16")).toBe("postgres");
    expect(engineOf("mysql:8")).toBe("mysql");
    expect(engineOf("mariadb:11")).toBe("mysql");
    expect(engineOf("redis:7-alpine")).toBe("redis");
    expect(engineOf("mongo:7")).toBe("mongo");
    expect(engineOf("rabbitmq:3-management")).toBe("rabbitmq");
  });

  it("ignores a registry host and an explicit library namespace", () => {
    expect(engineOf("docker.io/library/postgres:16-alpine")).toBe("postgres");
    expect(engineOf("library/redis")).toBe("redis");
    expect(engineOf("registry.example.com:5000/postgres:16")).toBe("postgres");
  });

  it("ignores a digest", () => {
    expect(engineOf("postgres@sha256:abc123")).toBe("postgres");
  });

  it("matches postgres variants", () => {
    expect(engineOf("pgvector")).toBe("postgres");
    expect(engineOf("timescaledb")).toBe("postgres");
    expect(engineOf("supabase/postgres:15")).toBe("postgres");
  });

  it("does not match an application image whose TAG mentions an engine", () => {
    // The trap a naive substring match falls into: this is the app, not a DB.
    expect(engineOf("mycompany/api:with-redis-support")).toBeUndefined();
    expect(engineOf("myapp:postgres-client")).toBeUndefined();
  });

  it("matches an engine published under its own namespace", () => {
    // valkey/valkey is Valkey's official image, and bitnami republishes the
    // engines under its own namespace. Both are real databases.
    expect(engineOf("valkey/valkey:8")).toBe("redis");
    expect(engineOf("bitnami/redis:7")).toBe("redis");
  });

  it("does not match a namespaced image that merely resembles an engine", () => {
    // Reduces to "postgresql-repmgr", which the anchored patterns reject.
    expect(engineOf("bitnami/postgresql-repmgr")).toBeUndefined();
  });

  it("ignores a service that only builds, with no image", () => {
    expect(declaresOwnDatabase(stack("services:\n  api:\n    build: .\n"))).toBe(false);
  });
});

describe("declaresOwnDatabase", () => {
  it("is false for a stack expecting a managed database", () => {
    // The Django/Laravel shape: app services only, credentials from env.
    const parsed = stack(`services:
  web:
    build: .
    environment:
      DATABASE_URL: \${DATABASE_URL:?set it}
  worker:
    build: .
`);
    expect(declaresOwnDatabase(parsed)).toBe(false);
  });

  it("is true as soon as a cache is declared, even with no database", () => {
    expect(declaresOwnDatabase(stack("services:\n  cache:\n    image: redis:7\n"))).toBe(true);
  });

  it("reports several engines in one stack", () => {
    const parsed = stack(
      "services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n  mq:\n    image: rabbitmq:3\n",
    );
    expect(detectComposeDatabases(parsed).map((d) => d.serviceType)).toEqual([
      "database",
      "cache",
      "queue",
    ]);
  });
});
