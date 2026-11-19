import { afterEach, describe, expect, it, vi } from "vitest";
import { guardedFetch, isBlockedAddress } from "../guarded-fetch.js";

function res(status: number, location?: string): Response {
  return { status, ok: status < 300, headers: new Headers(location ? { location } : {}) } as unknown as Response;
}

describe("isBlockedAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"])(
    "blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "140.82.112.6", "2606:4700::1111"])("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

describe("guardedFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses an endpoint that is an internal address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(guardedFetch("http://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({ code: "bad_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a redirect to an internal address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(302, "http://127.0.0.1:8080/admin"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(guardedFetch("https://api.github.com/repos/a/b")).rejects.toMatchObject({ code: "bad_request" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect and drops the token when the host changes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(301, "https://8.8.8.8/elsewhere"))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const out = await guardedFetch("https://api.github.com/repos/a/b", { headers: { Authorization: "Bearer t", Accept: "x" } });
    expect(out.status).toBe(200);
    const second = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(second.headers).get("authorization")).toBeNull();
    expect(new Headers(second.headers).get("accept")).toBe("x");
  });

  it("does not follow a redirect of a write", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(307, "https://8.8.8.8/x"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await guardedFetch("https://api.github.com/repos/a/b/pulls", { method: "POST" });
    expect(out.status).toBe(307);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
