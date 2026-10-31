/**
 * The stack whose deploy actually failed.
 *
 * A real compose deploy of this repository pulled Postgres and Redis, built
 * four application images, and then died at container start:
 *
 *   Bind for :::80 failed: port is already allocated
 *
 * Its `web` service publishes host port 80, which Dokploy's Traefik owns on
 * every server it manages. Nothing in the pipeline was wrong — the information
 * was sitting in a file we already parse, and we let the user spend a full
 * build to discover it.
 *
 * This fixture pins that case, plus the two other things in the same file that
 * the parser originally got wrong: a `profiles:`-gated DESTRUCTIVE seeder being
 * counted as part of the stack, and a YAML anchor used as a `build:` alias.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCompose, runnableServices, requiredVariables } from "../parse.js";
import { pickEntryService, resolveEntryPort } from "../entry.js";
import { declaresOwnDatabase } from "../databases.js";

const yaml = readFileSync(join(import.meta.dirname, "fixtures/maildrill.yml"), "utf8");
const parsed = parseCompose(yaml, "", ["Dockerfile", "package.json", "workers/package.json"]);

describe("maildrill — the host port collision", () => {
  it("reports web's host port 80 as a BLOCKING problem", () => {
    // Blocking, not advisory: the deploy cannot succeed, and the whole stack
    // builds before Docker refuses. A warning would be read past.
    const portProblems = parsed.problems.filter((p) => p.includes("host port"));
    expect(portProblems).toHaveLength(1);
    expect(portProblems[0]).toContain('"web"');
    expect(portProblems[0]).toContain("80");
  });

  it("reads web's host and container ports as the distinct things they are", () => {
    // '80:4321' — 80 on the host (the collision), 4321 inside (where Traefik
    // should actually forward).
    const web = parsed.services.find((s) => s.name === "web")!;
    expect(web.publishedPorts).toEqual([80]);
    expect(web.ports).toEqual([4321]);
  });

  it("does not flag the APIs' own host ports", () => {
    // 3001/3002/3003 do not collide with Traefik. They expose the backends
    // directly on the host, which is the user's business, not a deploy failure.
    for (const name of ["product-api", "messaging-api"]) {
      expect(parsed.problems.join(" ")).not.toContain(`"${name}"`);
    }
  });

  it("does not choke on an interpolated host port", () => {
    // '${EB_HOST_PORT:-3003}:3003' — the host side is a variable, so no literal
    // port can be read from it, and guessing one would be worse than nothing.
    const eb = parsed.services.find((s) => s.name === "email-builder-api")!;
    expect(eb.ports).toEqual([3003]);
    expect(eb.publishedPorts).toEqual([]);
  });
});

describe("maildrill — profiles", () => {
  it("excludes the profiled seeder from the running stack", () => {
    // `profiles: ['seed']` exists precisely because this seeder DELETES every
    // tenant but the dev one. Dokploy runs `up` without `--profile`, so it
    // never starts — counting it would overstate the stack, and offering it as
    // a domain target would point Traefik at a container that never exists.
    expect(parsed.services.map((s) => s.name)).toContain("seed");
    expect(runnableServices(parsed).map((s) => s.name)).not.toContain("seed");
  });

  it("counts the services that actually run", () => {
    expect(runnableServices(parsed).map((s) => s.name)).toEqual([
      "postgres",
      "redis",
      "migrate",
      "product-api",
      "messaging-api",
      "email-builder-api",
      "workers",
      "web",
    ]);
  });

  it("keeps the one-shot migrate service, which DOES run", () => {
    // `restart: 'no'` with a command is a one-shot job, not a build-only
    // pseudo-service: it runs, and the stack depends on it completing.
    const migrate = parsed.services.find((s) => s.name === "migrate")!;
    expect(migrate.buildOnly).toBe(false);
    expect(migrate.profiles).toEqual([]);
  });

  it("never offers a profiled service as the domain target", () => {
    expect(pickEntryService(parsed)?.name).not.toBe("seed");
  });
});

describe("maildrill — entry service and port", () => {
  it("picks web, by name, when nothing is on dokploy-network", () => {
    // No service joins dokploy-network here, so the network tiers find nothing
    // and four services publish ports. The conventional-name tie-break picks
    // web — which is correct: it is the only browser-facing service.
    expect(pickEntryService(parsed)?.name).toBe("web");
  });

  it("routes to web's CONTAINER port, not its host port", () => {
    // 4321, not 80. Dokploy writes this straight into the Traefik
    // loadbalancer label, so 80 here would Bad Gateway even after the port
    // collision was fixed.
    const web = pickEntryService(parsed)!;
    expect(resolveEntryPort(web)).toBe(4321);
  });
});

describe("maildrill — the rest of the file", () => {
  it("resolves a build that is a YAML anchor alias", () => {
    // `build: *app-build` rather than an inline map. Every app service shares
    // one anchor; if alias resolution failed, all of them would look
    // image-only and their build contexts would never be checked.
    //
    // `dockerfile` stays undefined because the anchor declares only a context
    // and args. That is correct, not a miss: Docker then looks for `Dockerfile`
    // inside the context, which is exactly what dockerfileExpose falls back to.
    for (const name of ["migrate", "product-api", "web"]) {
      expect(parsed.services.find((s) => s.name === name)!.build).toEqual({
        context: "",
        dockerfile: undefined,
      });
    }
  });

  it("detects the stack's own Postgres and Redis", () => {
    expect(declaresOwnDatabase(parsed)).toBe(true);
  });

  it("warns that nothing joins dokploy-network", () => {
    // True of this file, and the reason a domain could not be routed even if
    // port 80 were freed. Separate from the port problem.
    expect(parsed.warnings.join(" ")).toContain("dokploy-network");
  });

  it("finds no required variables — every reference has a default", () => {
    // This file uses `${VAR:-default}` throughout and no `${VAR:?}`, so the
    // pre-flight check correctly blocks nothing.
    expect(requiredVariables(parsed)).toEqual([]);
  });
});
