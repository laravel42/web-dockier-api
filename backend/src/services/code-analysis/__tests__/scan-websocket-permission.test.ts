/**
 * The scan progress WebSocket streams the same status and summary as the REST
 * scan routes, which require scan:view. It only checked the token and the tenant,
 * so a member without scan:view could still follow every scan.
 *
 * Asserted through what the handler did (read the scan, subscribed), not the
 * client's close event: the handler can close before injectWS resolves, so
 * waiting for that event made the result depend on timing.
 */
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "u1", email: "u@x", tenantId: "org-1" };
vi.mock("../../../shared/auth/auth.js", () => ({ verifyAuthToken: (t: string) => (t === "good" ? auth : null) }));

const authHasPermissions = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/permissions/authorization.js", () => ({ authHasPermissions }));

const getScan = vi.hoisted(() => vi.fn());
vi.mock("../domain/scans.js", () => ({ getScan }));

const subscribeToScan = vi.hoisted(() => vi.fn());
vi.mock("../domain/scan-events.js", () => ({
  subscribeToScan,
  unsubscribeFromScan: vi.fn(),
  sendScanSnapshot: vi.fn(),
}));

const { registerScanWebSocketRoutes } = await import("../routes/websocket.js");

/** Connect, let the handler run to completion, then tear everything down. */
async function connect(token: string): Promise<void> {
  const app = Fastify();
  await registerScanWebSocketRoutes(app);
  await app.ready();
  const ws = await app.injectWS(`/code-analysis/scans/s1/ws?token=${token}`);
  await new Promise((r) => setTimeout(r, 100));
  ws.terminate();
  await app.close();
}

afterEach(() => vi.clearAllMocks());

describe("scan WebSocket", () => {
  it("refuses a member without scan:view, before reading the scan", async () => {
    authHasPermissions.mockResolvedValue(false);
    await connect("good");
    expect(authHasPermissions).toHaveBeenCalledWith(auth, ["scan:view"]);
    expect(getScan).not.toHaveBeenCalled();
    expect(subscribeToScan).not.toHaveBeenCalled();
  });

  it("subscribes a member who has scan:view", async () => {
    authHasPermissions.mockResolvedValue(true);
    getScan.mockResolvedValue({ status: "running", summary: {} });
    await connect("good");
    expect(getScan).toHaveBeenCalledWith("s1", "org-1");
    expect(subscribeToScan).toHaveBeenCalledWith("s1", expect.anything());
  });

  it("still refuses a bad token, without resolving permissions", async () => {
    await connect("bad");
    expect(authHasPermissions).not.toHaveBeenCalled();
    expect(subscribeToScan).not.toHaveBeenCalled();
  });
});
