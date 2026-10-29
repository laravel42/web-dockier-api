/**
 * Compose parsing tests.
 *
 * The berry fixture is the real `deploy/dokploy/docker-compose.yml` from
 * laravel42/berry, checked in verbatim. It is the case this feature was designed
 * against and it exercises every awkward part at once: YAML anchors with merge
 * keys, a compose file nested two directories deep, `build.context: ../..`
 * pointing back at the repo root, services that publish no ports, a build-only
 * pseudo-service, user-authored Traefik labels, `$$` escapes inside a regex, and
 * all three interpolation forms. Synthetic cases cover what berry happens not to
 * contain.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCompose,
  requiredVariables,
  resolveFrom,
  scanVariables,
  DOKPLOY_NETWORK,
} from "../parse.js";

const berryYaml = readFileSync(join(import.meta.dirname, "fixtures/berry-dokploy.yml"), "utf8");
const BERRY_DIR = "deploy/dokploy";

/** The parts of berry's real file tree the parser actually consults. */
const BERRY_TREE = [
  "package.json",
  "pnpm-workspace.yaml",
  "deploy/dokploy/docker-compose.yml",
  "deploy/dokploy/.env.example",
  "deploy/local/docker-compose.yml",
  "deploy/aws/host/compose.yml",
  "deploy/docker/api.Dockerfile",
  "deploy/docker/web.Dockerfile",
  "server-ts/sandbox/agentcore/Dockerfile",
  "server-ts/package.json",
  "frontend/package.json",
];

describe("parseCompose — berry fixture", () => {
  const parsed = parseCompose(berryYaml, BERRY_DIR, BERRY_TREE);

  it("finds every service, including the build-only one", () => {
    expect(parsed.services.map((s) => s.name)).toEqual([
      "postgres",
      "api",
      "sessions",
      "runtime-image",
      "web",
    ]);
  });

  it("reports no problems and no warnings for a correct file", () => {
    // Every build context resolves and dokploy-network is declared external,
    // so this file is deployable as-is.
    expect(parsed.problems).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it("resolves `context: ../..` from the compose file's directory to the repo root", () => {
    // This is the check that fails loudly if contexts are ever resolved against
    // the repo root instead: all three would be reported missing.
    const api = service(parsed, "api");
    expect(api.build).toEqual({ context: "", dockerfile: "deploy/docker/api.Dockerfile" });
  });

  it("resolves a context that is not the repo root", () => {
    // runtime-image uses `context: ../../server-ts`.
    expect(service(parsed, "runtime-image").build).toEqual({
      context: "server-ts",
      dockerfile: "server-ts/sandbox/agentcore/Dockerfile",
    });
  });

  it("marks the build-only pseudo-service and no other", () => {
    expect(parsed.services.filter((s) => s.buildOnly).map((s) => s.name)).toEqual(["runtime-image"]);
  });

  it("reads networks from the list form", () => {
    expect(service(parsed, "web").networks).toEqual(["berry", DOKPLOY_NETWORK]);
    expect(service(parsed, "postgres").networks).toEqual(["berry"]);
  });

  it("declares dokploy-network as external at the top level", () => {
    expect(parsed.externalNetworks).toEqual([DOKPLOY_NETWORK]);
  });

  it("finds no published ports anywhere — the case that breaks a ports-only heuristic", () => {
    for (const svc of parsed.services) {
      expect(svc.ports).toEqual([]);
      expect(svc.exposed).toEqual([]);
    }
  });

  it("reads the Traefik loadbalancer port and router rule the user wrote", () => {
    const api = service(parsed, "api");
    expect(api.traefikPort).toBe(4000);
    expect(api.hasTraefikRouter).toBe(true);
  });

  it("does not attribute the api's Traefik router to the web service", () => {
    // web is the intended domain target precisely because it has no router of
    // its own; if this inverts, the entry-service heuristic picks api.
    const web = service(parsed, "web");
    expect(web.hasTraefikRouter).toBe(false);
    expect(web.traefikPort).toBeUndefined();
  });

  it("resolves merge keys so anchored values are visible", () => {
    // `<<: *docker-host` injects BERRY_DOCKER_PUBLISH_ADDR into api and
    // sessions. Without merge:true the anchor contents never appear, and the
    // variables inside them would be missed by a structural scan.
    expect(berryYaml).toContain("<<: *docker-host");
    expect(variable(parsed, "DOCKER_BRIDGE_ADDR").requirement).toBe("optional");
  });

  it("identifies exactly the variables that abort the deploy when unset", () => {
    expect(requiredVariables(parsed).sort()).toEqual([
      "BERRY_AUTH_SECRET",
      "BERRY_DOMAIN",
      "BERRY_PREVIEW_DOMAIN",
      "BERRY_PREVIEW_DOMAIN_REGEX",
      "BERRY_RUNTIME_AUTH_TOKEN",
      "INTEGRATION_ENCRYPTION_KEY",
      "POSTGRES_PASSWORD",
    ]);
  });

  it("treats a variable as required when any single reference requires it", () => {
    // POSTGRES_PASSWORD appears as ${POSTGRES_PASSWORD:?...} on postgres and as
    // a bare ${POSTGRES_PASSWORD} inside api's DATABASE_URL. One required
    // reference is enough to abort the deploy, so it stays required...
    expect(variable(parsed, "POSTGRES_PASSWORD").requirement).toBe("required");
    // ...while BERRY_RUNTIME_CALLBACK_URL only ever has a default.
    expect(variable(parsed, "BERRY_RUNTIME_CALLBACK_URL").requirement).toBe("optional");
  });

  it("does not mistake a `$$` escape for a variable", () => {
    // The preview router rule ends `...$$` to emit a literal $ for Traefik's
    // regex anchor. A naive scan reports a variable named after whatever
    // follows it.
    expect(berryYaml).toContain("$$");
    expect(parsed.variables.map((v) => v.name)).not.toContain("");
    expect(parsed.variables.every((v) => /^[A-Za-z_]\w*$/.test(v.name))).toBe(true);
  });
});

describe("parseCompose — build context verification", () => {
  it("reports a context that does not exist in the repository", () => {
    // The failure mode this check exists for: a compose file left behind after
    // directories were renamed.
    const yaml = `
services:
  api:
    build:
      context: ./services/mystore
`;
    const parsed = parseCompose(yaml, "", ["services/shopapi/manage.py"]);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain('"api"');
    expect(parsed.problems[0]).toContain("services/mystore");
  });

  it("reports a named Dockerfile that does not exist", () => {
    const yaml = `
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.prod
`;
    const parsed = parseCompose(yaml, "", ["Dockerfile", "package.json"]);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain("Dockerfile.prod");
  });

  it("accepts the short `build: ./dir` form", () => {
    const yaml = `
services:
  api:
    build: ./apps/api
`;
    const parsed = parseCompose(yaml, "", ["apps/api/main.go"]);
    expect(parsed.problems).toEqual([]);
    expect(parsed.services[0].build).toEqual({ context: "apps/api" });
  });

  it("skips context checks when no file tree is supplied", () => {
    const yaml = `
services:
  api:
    build: ./nowhere
`;
    expect(parseCompose(yaml, "").problems).toEqual([]);
  });
});

describe("parseCompose — ports", () => {
  /** Build a one-service file and read back its container ports. */
  const portsOf = (portsYaml: string): number[] =>
    parseCompose(`services:\n  web:\n    image: nginx\n    ports:\n${portsYaml}`, "").services[0].ports;

  it("takes the CONTAINER port from host:container", () => {
    // The direction that matters: routing Traefik at 8080 here Bad Gateways
    // every request.
    expect(portsOf('      - "8080:3000"\n')).toEqual([3000]);
  });

  it("takes the container port from ip:host:container", () => {
    expect(portsOf('      - "127.0.0.1:8080:3000"\n')).toEqual([3000]);
  });

  it("reads a bare port as the container port", () => {
    expect(portsOf('      - "3000"\n')).toEqual([3000]);
    expect(portsOf("      - 3000\n")).toEqual([3000]);
  });

  it("strips a protocol suffix", () => {
    expect(portsOf('      - "8080:3000/tcp"\n')).toEqual([3000]);
    expect(portsOf('      - "53:53/udp"\n')).toEqual([53]);
  });

  it("takes the first port of a published range", () => {
    expect(portsOf('      - "3000-3002"\n')).toEqual([3000]);
    expect(portsOf('      - "8000-8002:3000-3002"\n')).toEqual([3000]);
  });

  it("reads `target` from the long form, not `published`", () => {
    expect(portsOf("      - target: 3000\n        published: 8080\n        protocol: tcp\n")).toEqual([3000]);
  });

  it("preserves declaration order across several ports", () => {
    expect(portsOf('      - "8080:3000"\n      - "9090:9000"\n')).toEqual([3000, 9000]);
  });

  it("ignores an unparseable or out-of-range entry", () => {
    expect(portsOf('      - "not-a-port"\n      - "99999"\n      - "0"\n')).toEqual([]);
  });

  it("reads expose separately from ports", () => {
    const parsed = parseCompose(
      'services:\n  web:\n    image: nginx\n    expose:\n      - "4000"\n      - 5000\n',
      "",
    );
    expect(parsed.services[0].exposed).toEqual([4000, 5000]);
    expect(parsed.services[0].ports).toEqual([]);
  });
});

describe("scanVariables — the three interpolation forms", () => {
  it("classifies required, defaulted and bare references", () => {
    const vars = scanVariables("a: ${REQ:?must be set}\nb: ${OPT:-fallback}\nc: ${PLAIN}\nd: $SHORT\n");
    expect(byName(vars)).toEqual({
      REQ: "required",
      OPT: "optional",
      PLAIN: "optional",
      SHORT: "optional",
    });
  });

  it("treats the no-colon forms the same as their colon counterparts", () => {
    // ${VAR?err} aborts on UNSET (but allows empty); ${VAR-default} substitutes.
    // Both are handled, and the distinction between unset and empty is not one
    // we can act on anyway.
    expect(byName(scanVariables("a: ${REQ?err}\nb: ${OPT-def}\n"))).toEqual({
      REQ: "required",
      OPT: "optional",
    });
  });

  it("ignores $$ escapes", () => {
    expect(scanVariables("rule: HostRegexp(`^x\\.${DOMAIN:?set}$$`)\n").map((v) => v.name)).toEqual([
      "DOMAIN",
    ]);
  });

  it("de-duplicates repeated references", () => {
    expect(scanVariables("a: ${X}\nb: ${X}\nc: ${X:-1}\n")).toEqual([
      { name: "X", requirement: "optional" },
    ]);
  });

  it("finds variables in a file that does not parse as YAML", () => {
    // The text scan is independent of the structural parse on purpose: a broken
    // file should still tell the user which variables it wanted.
    const parsed = parseCompose("services:\n  web:\n  bad: [unclosed\n    x: ${NEEDED:?set it}\n", "");
    expect(parsed.problems.length).toBeGreaterThan(0);
    expect(requiredVariables(parsed)).toContain("NEEDED");
  });
});

describe("parseCompose — networks and labels", () => {
  it("reads networks from the map form", () => {
    const parsed = parseCompose(
      `services:
  web:
    image: nginx
    networks:
      berry:
      ${DOKPLOY_NETWORK}:
`,
      "",
    );
    expect(parsed.services[0].networks).toEqual(["berry", DOKPLOY_NETWORK]);
  });

  it("reads labels from the map form", () => {
    const parsed = parseCompose(
      `services:
  web:
    image: nginx
    networks: [${DOKPLOY_NETWORK}]
    labels:
      traefik.enable: true
      traefik.http.services.web.loadbalancer.server.port: 8000
`,
      "",
    );
    expect(parsed.services[0].traefikPort).toBe(8000);
  });

  it("warns when nothing joins dokploy-network", () => {
    const parsed = parseCompose("services:\n  web:\n    image: nginx\n", "");
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain(DOKPLOY_NETWORK);
  });

  it("warns when dokploy-network is used but not declared external", () => {
    // Compose would silently create its own network of that name, so Traefik
    // never sees the service — a green deploy serving nothing.
    const parsed = parseCompose(
      `services:
  web:
    image: nginx
    networks: [${DOKPLOY_NETWORK}]
`,
      "",
    );
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain("external: true");
  });

  it("does not warn about the network when only a build-only service lacks it", () => {
    const parsed = parseCompose(
      `services:
  web:
    image: nginx
    networks: [${DOKPLOY_NETWORK}]
  builder:
    build: .
    network_mode: none
networks:
  ${DOKPLOY_NETWORK}:
    external: true
`,
      "",
    );
    expect(parsed.warnings).toEqual([]);
  });
});

describe("parseCompose — malformed input", () => {
  it("reports a file with no services", () => {
    const parsed = parseCompose("version: '3'\nvolumes:\n  data:\n", "");
    expect(parsed.problems).toEqual(["The compose file declares no services."]);
    expect(parsed.services).toEqual([]);
  });

  it("reports an empty file", () => {
    expect(parseCompose("", "").problems).toEqual(["The compose file declares no services."]);
  });

  it("never throws on invalid YAML", () => {
    const parsed = parseCompose("services: [unclosed\n", "");
    expect(parsed.problems[0]).toContain("not valid YAML");
    expect(parsed.services).toEqual([]);
  });
});

describe("resolveFrom", () => {
  it("walks up out of a nested compose directory", () => {
    expect(resolveFrom("deploy/dokploy", "../..")).toBe("");
    expect(resolveFrom("deploy/dokploy", "../../server-ts")).toBe("server-ts");
  });

  it("treats . and ./ as the compose directory itself", () => {
    expect(resolveFrom("deploy", ".")).toBe("deploy");
    expect(resolveFrom("deploy", "./api")).toBe("deploy/api");
  });

  it("handles the repo root as the base", () => {
    expect(resolveFrom("", "./apps/api")).toBe("apps/api");
    expect(resolveFrom("", ".")).toBe("");
  });

  it("clamps `..` at the repo root instead of escaping it", () => {
    expect(resolveFrom("deploy", "../../../..")).toBe("");
  });
});

// ─── helpers ─────────────────────────────────────────────────────

function service(parsed: ReturnType<typeof parseCompose>, name: string) {
  const found = parsed.services.find((s) => s.name === name);
  if (!found) throw new Error(`fixture is missing service "${name}"`);
  return found;
}

function variable(parsed: ReturnType<typeof parseCompose>, name: string) {
  const found = parsed.variables.find((v) => v.name === name);
  if (!found) throw new Error(`fixture is missing variable "${name}"`);
  return found;
}

function byName(vars: Array<{ name: string; requirement: string }>): Record<string, string> {
  return Object.fromEntries(vars.map((v) => [v.name, v.requirement]));
}
