/**
 * Entry-service and port resolution.
 *
 * The berry fixture is the case that drove the design: FIVE services, none of
 * them publishing a port, two on dokploy-network, one of those already carrying
 * its own Traefik router, and one build-only pseudo-service. A ports-based
 * heuristic finds nothing here, and a "first service on the network" heuristic
 * picks the wrong one.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCompose, DOKPLOY_NETWORK } from "../parse.js";
import { pickEntryService, resolveEntryPort, isRoutable } from "../entry.js";

const berry = parseCompose(
  readFileSync(join(import.meta.dirname, "fixtures/berry-dokploy.yml"), "utf8"),
  "deploy/dokploy",
);

/** Minimal parsed shape for synthetic cases. */
function stack(yaml: string) {
  return parseCompose(yaml, "");
}

describe("pickEntryService — berry fixture", () => {
  it("picks web: on dokploy-network and routed by nobody else", () => {
    // api is also on dokploy-network but declares its own HostRegexp router for
    // preview hostnames, so it is already reachable by design and is not the
    // stack's front door. berry's own .env.example confirms the answer:
    // "Add the same host in the Domains tab: service `web`, port 3000".
    expect(pickEntryService(berry)?.name).toBe("web");
  });

  it("never picks the build-only service", () => {
    expect(pickEntryService(berry)?.name).not.toBe("runtime-image");
  });

  it("never picks the database", () => {
    expect(pickEntryService(berry)?.name).not.toBe("postgres");
  });
});

describe("resolveEntryPort — berry fixture", () => {
  it("falls through to the build Dockerfile's EXPOSE", () => {
    // web declares no ports, no expose and no Traefik port, so the only
    // evidence is EXPOSE 3000 in deploy/docker/web.Dockerfile, which the caller
    // fetches and passes in. This tier is what makes berry zero-input.
    const web = berry.services.find((s) => s.name === "web")!;
    expect(resolveEntryPort(web)).toBeUndefined();
    expect(resolveEntryPort(web, 3000)).toBe(3000);
  });

  it("prefers the service's own Traefik port over a Dockerfile EXPOSE", () => {
    // api declares loadbalancer.server.port=4000 and its Dockerfile also
    // EXPOSEs 4000; the label is the more specific statement of intent.
    const api = berry.services.find((s) => s.name === "api")!;
    expect(resolveEntryPort(api, 9999)).toBe(4000);
  });
});

describe("pickEntryService — tier order", () => {
  it("prefers a service with no router over one that has its own", () => {
    const parsed = stack(`services:
  api:
    image: api
    networks: [${DOKPLOY_NETWORK}]
    labels:
      - traefik.http.routers.api.rule=Host(\`api.example.com\`)
  web:
    image: web
    networks: [${DOKPLOY_NETWORK}]
networks:
  ${DOKPLOY_NETWORK}:
    external: true
`);
    expect(pickEntryService(parsed)?.name).toBe("web");
  });

  it("falls back to dokploy-network membership when every candidate has a router", () => {
    const parsed = stack(`services:
  only:
    image: x
    networks: [${DOKPLOY_NETWORK}]
    labels:
      - traefik.http.routers.only.rule=Host(\`x.example.com\`)
networks:
  ${DOKPLOY_NETWORK}:
    external: true
`);
    expect(pickEntryService(parsed)?.name).toBe("only");
  });

  it("uses a conventional name to break a tie within a tier", () => {
    const parsed = stack(`services:
  worker:
    image: w
    networks: [${DOKPLOY_NETWORK}]
  web:
    image: n
    networks: [${DOKPLOY_NETWORK}]
networks:
  ${DOKPLOY_NETWORK}:
    external: true
`);
    expect(pickEntryService(parsed)?.name).toBe("web");
  });

  it("falls back to a published port when nothing is on dokploy-network", () => {
    const parsed = stack(`services:
  db:
    image: postgres:16
  site:
    image: nginx
    ports: ["8080:80"]
`);
    expect(pickEntryService(parsed)?.name).toBe("site");
  });

  it("falls back to a conventional name when nothing publishes a port", () => {
    const parsed = stack("services:\n  queue:\n    image: q\n  frontend:\n    image: f\n");
    expect(pickEntryService(parsed)?.name).toBe("frontend");
  });

  it("picks the only runnable service even with no other signal", () => {
    const parsed = stack("services:\n  whatever:\n    image: x\n  builder:\n    build: .\n    network_mode: none\n");
    expect(pickEntryService(parsed)?.name).toBe("whatever");
  });

  it("gives up rather than guess between two equally plausible services", () => {
    // Two unnamed, unported, un-networked services: a wrong pick here is a
    // silent Bad Gateway, so the wizard must ask.
    const parsed = stack("services:\n  alpha:\n    image: a\n  beta:\n    image: b\n");
    expect(pickEntryService(parsed)).toBeUndefined();
  });

  it("returns undefined for a stack with no runnable service", () => {
    const parsed = stack("services:\n  builder:\n    build: .\n    network_mode: none\n");
    expect(pickEntryService(parsed)).toBeUndefined();
  });
});

describe("resolveEntryPort — chain order", () => {
  const svcWith = (body: string) => stack(`services:\n  web:\n    image: nginx\n${body}`).services[0];

  it("prefers ports over everything below it", () => {
    const svc = svcWith(
      '    ports: ["8080:3000"]\n    expose: ["4000"]\n    labels:\n      - traefik.http.services.web.loadbalancer.server.port=5000\n',
    );
    expect(resolveEntryPort(svc, 6000)).toBe(3000);
  });

  it("prefers expose over a Traefik label", () => {
    const svc = svcWith(
      '    expose: ["4000"]\n    labels:\n      - traefik.http.services.web.loadbalancer.server.port=5000\n',
    );
    expect(resolveEntryPort(svc, 6000)).toBe(4000);
  });

  it("returns undefined when nothing states a port", () => {
    expect(resolveEntryPort(svcWith(""))).toBeUndefined();
  });
});

describe("isRoutable", () => {
  it("is true only for a service on dokploy-network", () => {
    expect(isRoutable(berry.services.find((s) => s.name === "web")!)).toBe(true);
    expect(isRoutable(berry.services.find((s) => s.name === "postgres")!)).toBe(false);
  });
});
