import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));
// Keep the poll loop instant.
vi.mock("../../../../../shared/utils/time.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sleep: async () => undefined,
}));

const { stageDeployCompose } = await import("../stages/deploy-compose.js");

// ─── Fixtures ──────────────────────────────────────────────────────

type Deployment = {
  deploymentId: string;
  status: string;
  logPath?: string | null;
  errorMessage?: string | null;
  title?: string | null;
};

function createClient(opts: {
  deployments?: Deployment[][];
  domains?: unknown[];
  generated?: string;
  converted?: string;
} = {}) {
  const queue = [...(opts.deployments ?? [[{ deploymentId: "d-new", status: "done" }]])];
  let last = queue[queue.length - 1] ?? [];

  return {
    listComposeDeployments: vi.fn(async () => {
      const next = queue.shift();
      if (next) last = next;
      return last as never;
    }),
    deployCompose: vi.fn(async () => undefined),
    listComposeDomains: vi.fn(async () => (opts.domains ?? []) as never),
    generateDomain: vi.fn(async () => opts.generated ?? "stack-1-2-3-4.sslip.io"),
    createDomain: vi.fn(async (p: Record<string, unknown>) => ({ host: p.host, https: false })),
    updateDomain: vi.fn(async () => undefined),
    getConvertedCompose: vi.fn(async () => opts.converted ?? "services:\n  web: {}\n"),
  };
}

const logLines: string[] = [];
const log = async (line: string) => void logLines.push(line);

function run(client: unknown, extra: Record<string, unknown> = {}) {
  return stageDeployCompose({
    composeId: "dcomp-1",
    appName: "compose-abc",
    serverId: "srv-1",
    entryService: "web",
    entryPort: 3000,
    client: client as never,
    log,
    pollIntervalMs: 1,
    ...extra,
  });
}

beforeEach(() => void (logLines.length = 0));
afterEach(() => vi.clearAllMocks());

// ─── Happy path ────────────────────────────────────────────────────

describe("stageDeployCompose — success", () => {
  it("triggers the deploy and returns the stack URL", async () => {
    const client = createClient();
    const result = await run(client);

    expect(client.deployCompose).toHaveBeenCalledWith(
      expect.objectContaining({ composeId: "dcomp-1" }),
    );
    expect(result).toEqual({ status: "done", appUrl: "http://stack-1-2-3-4.sslip.io" });
  });

  it("registers the domain against the NAMED service, not the stack", async () => {
    // Dokploy attaches a compose domain to one service and writes the port into
    // that service's Traefik loadbalancer label.
    const client = createClient();
    await run(client);

    expect(client.createDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        composeId: "dcomp-1",
        serviceName: "web",
        domainType: "compose",
        port: 3000,
        certificateType: "none",
        https: false,
      }),
    );
    // An application id would make Dokploy attach it to the wrong resource kind.
    expect(client.createDomain.mock.calls[0][0]).not.toHaveProperty("applicationId");
  });

  it("follows the NEW deployment, not a stale error record from a previous run", async () => {
    // The reason this stage snapshots ids before triggering: an older failed
    // record would otherwise be read as this run failing immediately.
    const client = createClient({
      deployments: [
        [{ deploymentId: "d-old", status: "error" }],
        [{ deploymentId: "d-old", status: "error" }, { deploymentId: "d-new", status: "running" }],
        [{ deploymentId: "d-old", status: "error" }, { deploymentId: "d-new", status: "done" }],
      ],
    });

    const result = await run(client);

    expect(result.status).toBe("done");
  });
});

// ─── No public service ─────────────────────────────────────────────

describe("stageDeployCompose — nothing to publish", () => {
  it("attaches no domain when no entry service is configured", async () => {
    // An internal-only stack is a legitimate deployment.
    const client = createClient();
    const result = await run(client, { entryService: undefined });

    expect(result).toEqual({ status: "done", appUrl: "" });
    expect(client.createDomain).not.toHaveBeenCalled();
    expect(logLines.some((l) => /no public service is configured/i.test(l))).toBe(true);
  });

  it("attaches no domain when the port is unknown, rather than guessing one", async () => {
    // A guessed port produces a URL that Bad Gateways forever, which is worse
    // than no URL: the user believes the deploy published something.
    const client = createClient();
    const result = await run(client, { entryPort: undefined });

    expect(result.appUrl).toBe("");
    expect(client.createDomain).not.toHaveBeenCalled();
  });

  it("returns a successful deploy even when the domain call fails", async () => {
    const client = createClient({ generated: "" });
    const result = await run(client);

    expect(result.status).toBe("done");
    expect(result.appUrl).toBe("");
  });
});

// ─── Domain reuse ──────────────────────────────────────────────────

describe("stageDeployCompose — existing domain", () => {
  it("reuses a domain already on the entry service", async () => {
    const client = createClient({
      domains: [{ domainId: "dom-1", host: "app.example.com", port: 3000, https: true, path: "/", serviceName: "web" }],
    });

    const result = await run(client);

    expect(result.appUrl).toBe("https://app.example.com");
    expect(client.createDomain).not.toHaveBeenCalled();
    expect(client.updateDomain).not.toHaveBeenCalled();
  });

  it("reconciles a stale port and keeps the service name", async () => {
    // Dropping serviceName would leave Traefik with a router and no service to
    // forward to.
    const client = createClient({
      domains: [{ domainId: "dom-1", host: "app.example.com", port: 8080, https: true, path: "/", serviceName: "web" }],
    });

    await run(client);

    expect(client.updateDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: "dom-1",
        port: 3000,
        serviceName: "web",
        domainType: "compose",
      }),
    );
  });

  it("still returns the URL when the port update fails", async () => {
    const client = createClient({
      domains: [{ domainId: "dom-1", host: "app.example.com", port: 8080, https: false, path: "/", serviceName: "web" }],
    });
    client.updateDomain.mockRejectedValue(new Error("nope"));

    const result = await run(client);

    expect(result.appUrl).toBe("http://app.example.com");
    expect(logLines.some((l) => /could not update the existing domain/i.test(l))).toBe(true);
  });
});

// ─── Cancellation ──────────────────────────────────────────────────

describe("stageDeployCompose — cancellation", () => {
  it("stops watching and reports cancelled, not failed", async () => {
    const client = createClient({ deployments: [[{ deploymentId: "d-new", status: "running" }]] });

    const result = await run(client, { isCancelled: async () => true });

    expect(result).toEqual({ status: "cancelled", appUrl: "" });
    expect(client.createDomain).not.toHaveBeenCalled();
  });
});

// ─── Failure classification ────────────────────────────────────────

describe("stageDeployCompose — failure reporting", () => {
  const failWith = (evidence: string, opts: Record<string, unknown> = {}) =>
    run(
      createClient({
        deployments: [[{ deploymentId: "d-new", status: "error", errorMessage: evidence, logPath: null, title: "fix: thing" }]],
      }),
      opts,
    );

  it("explains a build context that does not exist", async () => {
    // The stale-compose-file failure.
    const result = await failWith('unable to prepare context: path "./services/mystore" not found');

    expect(result.status).toBe("error");
    expect(result.failureReason).toMatch(/\.\/services\/mystore/);
    expect(result.failureReason).toMatch(/does not exist in the repository/i);
  });

  it("explains a missing Dockerfile", async () => {
    const result = await failWith("failed to solve dockerfile: open /src/Dockerfile.prod: no such file");
    expect(result.failureReason).toMatch(/Dockerfile\.prod/);
  });

  it("explains an image that cannot be pulled", async () => {
    const result = await failWith("Error response from daemon: pull access denied for myorg/app:v2");
    expect(result.failureReason).toMatch(/could not be pulled/i);
  });

  it("explains a missing required variable", async () => {
    const result = await failWith('required variable POSTGRES_PASSWORD is missing a value: set it');
    expect(result.failureReason).toMatch(/POSTGRES_PASSWORD/);
  });

  it("explains a missing external network", async () => {
    const result = await failWith('network dokploy-network declared as external, but could not be found');
    expect(result.failureReason).toMatch(/dokploy-network/);
  });

  it("names the failing commit in the generic case", async () => {
    const result = await failWith("something nobody has seen before");
    expect(result.failureReason).toMatch(/fix: thing/);
  });

  it("logs the merged compose file when nothing is recognised", async () => {
    // It is what Dokploy actually ran, including the labels it injected — the
    // most useful artefact left when the patterns do not match.
    await failWith("unrecognised explosion");
    expect(logLines.some((l) => /merged compose file/i.test(l))).toBe(true);
  });

  it("reads the build log tail when one is available", async () => {
    const fetchBuildLog = vi.fn(async () => 'unable to prepare context: path "./missing" not found');
    const result = await run(
      createClient({
        deployments: [[{ deploymentId: "d-new", status: "error", errorMessage: null, logPath: "/var/log/x" }]],
      }),
      { fetchBuildLog },
    );

    expect(fetchBuildLog).toHaveBeenCalledWith("/var/log/x");
    expect(result.failureReason).toMatch(/\.\/missing/);
  });

  it("still reports a reason when the build log cannot be read", async () => {
    const result = await run(
      createClient({
        deployments: [[{ deploymentId: "d-new", status: "error", errorMessage: null, logPath: "/var/log/x" }]],
      }),
      { fetchBuildLog: vi.fn(async () => { throw new Error("ssh down"); }) },
    );

    expect(result.status).toBe("error");
    expect(result.failureReason).toBeTruthy();
  });
});

// ─── Timeout ───────────────────────────────────────────────────────

describe("stageDeployCompose — timeout", () => {
  it("throws when the build never finishes", async () => {
    const client = createClient({ deployments: [[{ deploymentId: "d-new", status: "running" }]] });

    await expect(run(client, { timeoutMs: 5 })).rejects.toThrow(/timed out/i);
  });
});
