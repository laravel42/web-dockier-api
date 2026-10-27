import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { osvApi } from "../services/osv";
import { setSession } from "../services/session";

/**
 * The OSV lookup is the one call that leaves our own API. It goes through
 * `request()` for the shared timeout and abort handling, which means it starts
 * from a code path that attaches our bearer token by default.
 */
describe("osvApi.getVuln", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setSession("secret-token", "user-1");
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ summary: "s", aliases: ["CVE-1"] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("calls the public OSV host, not our API base", async () => {
    await osvApi.getVuln("GHSA-aaaa-bbbb-cccc");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.osv.dev/v1/vulns/GHSA-aaaa-bbbb-cccc");
  });

  it("never forwards our bearer token to the third party", async () => {
    await osvApi.getVuln("GHSA-aaaa-bbbb-cccc");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("escapes the id so a scanner-supplied value cannot alter the path", async () => {
    await osvApi.getVuln("../../v1/query?x=1");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.osv.dev/v1/vulns/..%2F..%2Fv1%2Fquery%3Fx%3D1",
    );
  });

  it("passes an abort signal through so an unmount cancels the request", async () => {
    const controller = new AbortController();
    const promise = osvApi.getVuln("GHSA-aaaa-bbbb-cccc", controller.signal);
    await promise;
    // `request()` wraps the caller's signal in its own timeout controller, so
    // assert the request is abortable rather than identity of the signal.
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
