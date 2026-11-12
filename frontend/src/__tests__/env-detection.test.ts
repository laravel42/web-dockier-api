import { describe, expect, it } from "vitest";
import { detectServiceModes } from "@/components/DeployWizard/envDetection";

/**
 * The wizard's default for each detected service: provision it on the VPS, or
 * treat it as external. A wrong "external" deploys an app with no database to
 * talk to; a wrong "vps" provisions one nobody needed. The env list comes from
 * the AI analysis, so driver-only entries without a host are common.
 */
const env = (pairs: Record<string, string>) => Object.entries(pairs).map(([name, value]) => ({ name, value }));
const db = (pairs: Record<string, string>, engine?: string) => detectServiceModes(env(pairs), ["database"], engine).database;

describe("detectServiceModes — database", () => {
  it("recognises a managed provider", () => {
    const r = db({ DATABASE_URL: "postgres://u:p@ep-cool-1.eu-central-1.aws.neon.tech/app" });
    expect(r.mode).toBe("external");
    expect(r.hint).toContain("Neon");
  });

  it.each([
    ["127.0.0.1"], ["localhost"], ["localhost:5432"], ["::1"], ["[::1]:5432"],
    ["postgres"], ["host.docker.internal"], ["172.20.0.5"], ["10.0.0.4"], ["192.168.1.10"],
  ])("treats a local host (%s) as self-hosted", (host) => {
    expect(db({ DB_CONNECTION: "pgsql", DB_HOST: host }).mode).toBe("vps");
  });

  it("parses a local host out of a full URL", () => {
    expect(db({ DATABASE_URL: "postgres://u:p@localhost:5432/db" }).mode).toBe("vps");
    expect(db({ DATABASE_URL: "postgres://u:p@[::1]:5432/db" }).mode).toBe("vps");
  });

  it("does not take a public 172.x address for a private one", () => {
    // Only 172.16.0.0/12 is private; 172.217.x.x is a public Google range.
    expect(db({ DB_CONNECTION: "pgsql", DB_HOST: "172.217.1.1" }).mode).toBe("external");
  });

  it("an unrecognised remote host with real credentials is external", () => {
    expect(db({ DB_CONNECTION: "mysql", DB_HOST: "db.example.com" }).mode).toBe("external");
  });

  it("a driver name alone is not a credential", () => {
    // Laravel-style config naming the engine but no host: nothing external to connect to.
    expect(db({ DB_CONNECTION: "mysql", DB_DATABASE: "laravel" }).mode).toBe("vps");
  });

  it("sqlite needs no separate database", () => {
    const r = db({ DB_CONNECTION: "sqlite" });
    expect(r.mode).toBe("vps");
    expect(r.hint).toContain("no separate infrastructure needed");
  });

  it("the committed DB engine wins over the AI-guessed DB_CONNECTION", () => {
    expect(db({ DB_CONNECTION: "sqlite", DB_HOST: "db.example.com" }, "pgsql").mode).toBe("external");
  });

  it("missing keys, placeholders and malformed URLs default to self-hosted", () => {
    expect(db({}).mode).toBe("vps");
    expect(db({ DATABASE_URL: "your-value-here" }).mode).toBe("vps");
    expect(() => db({ DATABASE_URL: "postgres://" })).not.toThrow();
  });
});

describe("detectServiceModes — other services", () => {
  it("a cache driver alone is not an external cache", () => {
    expect(detectServiceModes(env({ CACHE_STORE: "redis" }), ["cache"]).cache?.mode).toBe("vps");
  });

  it("a no-infrastructure driver needs nothing provisioned", () => {
    expect(detectServiceModes(env({ QUEUE_CONNECTION: "sync" }), ["queue"]).queue?.hint).toContain("no separate infrastructure");
  });

  it("an unknown service type is self-hosted with no hint", () => {
    expect(detectServiceModes([], ["broadcasting"]).broadcasting).toEqual({ mode: "vps", hint: "" });
  });
});
