import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv({ ENV_ENCRYPTION_KEY: "b".repeat(64) }) }));
const sendEmail = vi.fn(async () => true);
vi.mock("../email-dispatch.js", () => ({ sendEmailNotification: (...a: unknown[]) => sendEmail(...(a as [])) }));

let channelRows: Array<Record<string, unknown>> = [];
const inserted: Array<Record<string, unknown>> = [];
function chain(result: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "order", "limit"]) c[m] = vi.fn(() => c);
  c.insert = vi.fn((row: Record<string, unknown>) => { inserted.push(row); return Promise.resolve({ error: null }); });
  c.maybeSingle = vi.fn(async () => ({ data: { id: "in-app", enabled: false }, error: null }));
  c.then = (resolve: (v: unknown) => void) => resolve({ data: result(), error: null });
  return c;
}
vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: vi.fn(() => chain(() => channelRows)) },
}));

const { createChannel, listChannels, sendNotification } = await import("../notifications.js");
const { encryptJson } = await import("../../../../shared/auth/crypto.js");

beforeEach(() => {
  vi.clearAllMocks();
  channelRows = [];
  inserted.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("createChannel", () => {
  it.each([
    ["slack", { webhookUrl: "http://hooks.slack.com/services/x" }],
    ["slack", { webhookUrl: "https://evil.example/services/x" }],
    ["webhook", { url: "http://169.254.169.254/latest" }],
    ["webhook", { url: "https://user:pw@example.com/hook" }],
    ["email", { email: "not-an-email" }],
  ] as const)("refuses %s %j", async (type, config) => {
    await expect(createChannel({ tenantId: "t", type, config: { ...config } })).rejects.toMatchObject({ code: "bad_request" });
  });

  it("stores the config encrypted and returns it masked", async () => {
    const out = await createChannel({ tenantId: "t", type: "slack", config: { webhookUrl: "https://hooks.slack.com/services/T/B/secret" } });
    expect(out.config.webhookUrl).toBe("https://hooks.slack.com/•••");
    expect(String(inserted[0]!.config)).not.toContain("secret");
  });
});

describe("listChannels", () => {
  it("masks webhook URLs from both encrypted and legacy plain-JSON rows", async () => {
    channelRows = [
      { id: "1", type: "slack", config: encryptJson({ webhookUrl: "https://hooks.slack.com/services/T/B/secret" }), enabled: true, created_at: "x" },
      { id: "2", type: "webhook", config: JSON.stringify({ url: "https://ci.example.com/hook?token=abc" }), enabled: true, created_at: "x" },
      { id: "3", type: "email", config: JSON.stringify({ email: "ops@example.com" }), enabled: true, created_at: "x" },
    ];
    const channels = await listChannels("t");
    expect(channels.map((c) => c.config)).toEqual([
      { webhookUrl: "https://hooks.slack.com/•••" },
      { url: "https://ci.example.com/•••" },
      { email: "ops@example.com" },
    ]);
  });
});

describe("sendNotification", () => {
  it("does not post to an internal address and counts only 2xx deliveries", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    channelRows = [
      { id: "a", type: "webhook", config: encryptJson({ url: "https://10.0.0.5/hook" }), enabled: true },
      { id: "b", type: "webhook", config: encryptJson({ url: "https://8.8.8.8/hook" }), enabled: true },
      { id: "c", type: "email", config: encryptJson({ email: "ops@example.com" }), enabled: true },
    ];
    const { sent } = await sendNotification({ tenantId: "t", title: "Scan completed", message: "m" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the public address, which then fails with 500
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("8.8.8.8");
    expect(sent).toBe(1); // the email
    expect(sendEmail).toHaveBeenCalledWith({ to: "ops@example.com", title: "Scan completed", message: "m" });
  });
});
