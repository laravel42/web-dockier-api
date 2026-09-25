import { describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));
vi.mock("../../../../../shared/utils/time.js", () => ({
  sleep: () => Promise.resolve(),
  logTimestamp: () => "2025-01-01T00:00:00Z",
}));

const { setupAndValidateWithRetry } = await import("../stages/provision-server.js");
import type { DokployClient } from "../client.js";

/**
 * Server readiness must wait for BOTH Docker AND the Dokploy overlay network.
 * Setup installs Docker, then initializes Swarm, then creates the network — so
 * returning as soon as Docker was up raced the caller's network requirement and
 * aborted otherwise-fine deploys with "Dokploy network not installed".
 */
describe("setupAndValidateWithRetry", () => {
  const log = async () => {};

  const validation = (docker: boolean, network: boolean) => ({
    docker: { enabled: docker },
    isDokployNetworkInstalled: network,
  });

  const clientWith = (responses: Array<ReturnType<typeof validation>>) => {
    let i = 0;
    return {
      setupServer: vi.fn(async () => undefined),
      validateServer: vi.fn(async () => responses[Math.min(i++, responses.length - 1)]),
    };
  };

  it("returns once Docker AND the network are ready", async () => {
    const client = clientWith([validation(true, true)]);
    const result = await setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { delayMs: 0 });
    expect(result.isDokployNetworkInstalled).toBe(true);
    expect(client.validateServer).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting when Docker is up but the network is not yet created", async () => {
    const client = clientWith([
      validation(true, false),
      validation(true, false),
      validation(true, true),
    ]);

    const result = await setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { delayMs: 0 });

    expect(result.isDokployNetworkInstalled).toBe(true);
    // Did NOT return on the first Docker-ready response.
    expect(client.validateServer).toHaveBeenCalledTimes(3);
  });

  it("keeps waiting while Docker itself is still installing", async () => {
    const client = clientWith([validation(false, false), validation(true, true)]);
    const result = await setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { delayMs: 0 });
    expect(result.docker?.enabled).toBe(true);
    expect(client.validateServer).toHaveBeenCalledTimes(2);
  });

  it("fails with a network-specific message when only the network never appears", async () => {
    const client = clientWith([validation(true, false)]);
    await expect(
      setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { attempts: 2, delayMs: 0 }),
    ).rejects.toThrow(/Dokploy network was not created/i);
  });

  it("fails with a Docker-specific message when Docker never installs", async () => {
    const client = clientWith([validation(false, false)]);
    await expect(
      setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { attempts: 2, delayMs: 0 }),
    ).rejects.toThrow(/Docker was not installed/i);
  });

  it("retries the transient 'please login as ubuntu' SSH window", async () => {
    let call = 0;
    const client = {
      setupServer: vi.fn(async () => undefined),
      validateServer: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("Failed to parse output: Please login as the user ubuntu");
        return validation(true, true);
      }),
    };

    const result = await setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { delayMs: 0 });
    expect(result.docker?.enabled).toBe(true);
  });

  it("fails fast on a structural error", async () => {
    const client = {
      setupServer: vi.fn(async () => undefined),
      validateServer: vi.fn(async () => { throw new Error("401 unauthorized"); }),
    };

    await expect(
      setupAndValidateWithRetry(client as unknown as DokployClient, "srv-1", log, { attempts: 5, delayMs: 0 }),
    ).rejects.toThrow(/unauthorized/i);
    expect(client.validateServer).toHaveBeenCalledTimes(1);
  });
});
