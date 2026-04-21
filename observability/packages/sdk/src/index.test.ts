import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { wrapFetch, type ObservabilitySDK } from "./index.js";

/**
 * Unit tests for the Frontend SDK — validates Requirements 10.1–10.5
 *
 * Note: XHR and initLogger tests that require XMLHttpRequest use a minimal
 * polyfill since vitest runs in Node.js by default.
 */

// ---------------------------------------------------------------------------
// Minimal XMLHttpRequest polyfill for Node.js test environment
// ---------------------------------------------------------------------------

class MockXMLHttpRequest extends EventTarget {
  static UNSENT = 0;
  static OPENED = 1;
  static HEADERS_RECEIVED = 2;
  static LOADING = 3;
  static DONE = 4;

  readyState = 0;
  status = 0;
  statusText = "";
  responseText = "";
  response: unknown = "";
  responseType = "";
  responseURL = "";
  timeout = 0;
  withCredentials = false;
  upload = new EventTarget();
  onreadystatechange: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  onload: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  onerror: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  onloadend: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  ontimeout: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  onprogress: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  onabort: ((this: XMLHttpRequest, ev: Event) => void) | null = null;
  onloadstart: ((this: XMLHttpRequest, ev: Event) => void) | null = null;

  open(_method: string, _url: string | URL, _async?: boolean) {
    this.readyState = 1;
  }

  send(_body?: unknown) {
    // no-op in mock
  }

  setRequestHeader(_name: string, _value: string) {
    // no-op in mock
  }

  abort() {}
  getAllResponseHeaders() { return ""; }
  getResponseHeader(_name: string) { return null; }
  overrideMimeType(_mime: string) {}
}

// Install the polyfill globally before any tests that need it
const hadXHR = "XMLHttpRequest" in globalThis;
const originalGlobalXHR = (globalThis as Record<string, unknown>).XMLHttpRequest;

beforeAll(() => {
  if (!hadXHR) {
    (globalThis as Record<string, unknown>).XMLHttpRequest = MockXMLHttpRequest;
  }
});

afterAll(() => {
  if (!hadXHR) {
    if (originalGlobalXHR === undefined) {
      delete (globalThis as Record<string, unknown>).XMLHttpRequest;
    } else {
      (globalThis as Record<string, unknown>).XMLHttpRequest = originalGlobalXHR;
    }
  }
});

// ---------------------------------------------------------------------------
// wrapFetch tests
// ---------------------------------------------------------------------------

describe("wrapFetch", () => {
  let sdk: ObservabilitySDK;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logSpy = vi.fn();
    sdk = {
      init: vi.fn(),
      destroy: vi.fn(),
      log: logSpy,
    };
  });

  it("logs a successful fetch call with method, url, status, and duration (Req 10.1, 10.3)", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    const result = await wrapped("https://example.com/api/data", { method: "POST" });

    expect(result).toBe(mockResponse);
    expect(originalFetch).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();

    const [level, message, data] = logSpy.mock.calls[0];
    expect(level).toBe("info");
    expect(message).toContain("POST");
    expect(message).toContain("https://example.com/api/data");
    expect(message).toContain("200");
    expect(data.source).toBe("frontend");
    expect(data.method).toBe("POST");
    expect(data.endpoint).toBe("https://example.com/api/data");
    expect(data.status).toBe(200);
    expect(typeof data.duration).toBe("number");
  });

  it("defaults method to GET when not specified", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped("https://example.com/api");

    const [, , data] = logSpy.mock.calls[0];
    expect(data.method).toBe("GET");
  });

  it("logs warn level for non-ok responses", async () => {
    const mockResponse = new Response("not found", { status: 404 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped("https://example.com/missing");

    const [level] = logSpy.mock.calls[0];
    expect(level).toBe("warn");
  });

  it("logs error on network failure and re-throws (Req 10.4)", async () => {
    const networkError = new Error("Failed to fetch");
    const originalFetch = vi.fn().mockRejectedValue(networkError);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);

    await expect(wrapped("https://example.com/fail")).rejects.toThrow("Failed to fetch");

    expect(logSpy).toHaveBeenCalledOnce();
    const [level, message, data] = logSpy.mock.calls[0];
    expect(level).toBe("error");
    expect(message).toContain("Network Error");
    expect(data.error).toBe("Failed to fetch");
    expect(typeof data.duration).toBe("number");
  });

  it("skips logging when X-Observability-SDK header is present (plain object) (Req 10.5)", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped("https://example.com/internal", {
      headers: { "X-Observability-SDK": "1" },
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(originalFetch).toHaveBeenCalledOnce();
  });

  it("skips logging when X-Observability-SDK header is in Headers instance (Req 10.5)", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const headers = new Headers();
    headers.set("X-Observability-SDK", "1");

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped("https://example.com/internal", { headers });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("skips logging when X-Observability-SDK header is in array-of-tuples (Req 10.5)", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped("https://example.com/internal", {
      headers: [["X-Observability-SDK", "1"]],
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("handles URL object input", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped(new URL("https://example.com/url-obj"));

    const [, , data] = logSpy.mock.calls[0];
    expect(data.endpoint).toBe("https://example.com/url-obj");
  });

  it("handles Request object input", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);

    const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
    await wrapped(new Request("https://example.com/req-obj"));

    const [, , data] = logSpy.mock.calls[0];
    expect(data.endpoint).toBe("https://example.com/req-obj");
  });
});

// ---------------------------------------------------------------------------
// wrapXHR tests (using polyfill)
// ---------------------------------------------------------------------------

describe("wrapXHR", () => {
  let sdk: ObservabilitySDK;
  let logSpy: ReturnType<typeof vi.fn>;
  let originalOpen: typeof XMLHttpRequest.prototype.open;
  let originalSend: typeof XMLHttpRequest.prototype.send;
  let originalSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader;

  beforeEach(async () => {
    logSpy = vi.fn();
    sdk = {
      init: vi.fn(),
      destroy: vi.fn(),
      log: logSpy,
    };
    // Save originals before wrapping
    originalOpen = XMLHttpRequest.prototype.open;
    originalSend = XMLHttpRequest.prototype.send;
    originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  });

  afterEach(() => {
    // Restore originals
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    XMLHttpRequest.prototype.setRequestHeader = originalSetRequestHeader;
  });

  it("intercepts XHR calls and logs on completion (Req 10.2, 10.3)", async () => {
    // Dynamic import to ensure polyfill is in place
    const { wrapXHR } = await import("./index.js");
    wrapXHR(sdk, XMLHttpRequest);

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://example.com/xhr-test");

    // Simulate a successful response by setting status before loadend
    Object.defineProperty(xhr, "status", { value: 200, writable: true, configurable: true });
    xhr.send();

    // Trigger loadend event
    xhr.dispatchEvent(new Event("loadend"));

    expect(logSpy).toHaveBeenCalledOnce();
    const [level, message, data] = logSpy.mock.calls[0];
    expect(level).toBe("info");
    expect(message).toContain("GET");
    expect(message).toContain("https://example.com/xhr-test");
    expect(data.source).toBe("frontend");
    expect(data.method).toBe("GET");
  });

  it("skips logging when X-Observability-SDK header is set (Req 10.5)", async () => {
    const { wrapXHR } = await import("./index.js");
    wrapXHR(sdk, XMLHttpRequest);

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://example.com/sdk-internal");
    xhr.setRequestHeader("X-Observability-SDK", "1");
    xhr.send();

    // Trigger loadend
    xhr.dispatchEvent(new Event("loadend"));

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs error for XHR with status 0 (network failure) (Req 10.4)", async () => {
    const { wrapXHR } = await import("./index.js");
    wrapXHR(sdk, XMLHttpRequest);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://example.com/fail");

    // Status 0 = network error (default in mock)
    xhr.send();
    xhr.dispatchEvent(new Event("loadend"));

    expect(logSpy).toHaveBeenCalledOnce();
    const [level, , data] = logSpy.mock.calls[0];
    expect(level).toBe("error");
    expect(data.error).toBe("XHR request failed");
    expect(data.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// initLogger tests
// ---------------------------------------------------------------------------

describe("initLogger", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalXHROpen: typeof XMLHttpRequest.prototype.open;
  let originalXHRSend: typeof XMLHttpRequest.prototype.send;
  let originalXHRSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalXHROpen = XMLHttpRequest.prototype.open;
    originalXHRSend = XMLHttpRequest.prototype.send;
    originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  });

  afterEach(() => {
    // Ensure cleanup even if destroy wasn't called
    globalThis.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;
    XMLHttpRequest.prototype.send = originalXHRSend;
    XMLHttpRequest.prototype.setRequestHeader = originalXHRSetRequestHeader;
    delete (globalThis as Record<string, unknown>).__observability_original_fetch__;
  });

  it("wraps globalThis.fetch when captureNetwork is true (Req 10.1)", async () => {
    const { initLogger } = await import("./index.js");
    const logger = initLogger({ captureNetwork: true });
    expect(globalThis.fetch).not.toBe(originalFetch);
    logger.destroy();
  });

  it("wraps XMLHttpRequest when captureNetwork is true (Req 10.2)", async () => {
    const { initLogger } = await import("./index.js");
    const logger = initLogger({ captureNetwork: true });
    expect(XMLHttpRequest.prototype.open).not.toBe(originalXHROpen);
    expect(XMLHttpRequest.prototype.send).not.toBe(originalXHRSend);
    logger.destroy();
  });

  it("does not wrap fetch/XHR when captureNetwork is false", async () => {
    const { initLogger } = await import("./index.js");
    const logger = initLogger({ captureNetwork: false });
    expect(globalThis.fetch).toBe(originalFetch);
    expect(XMLHttpRequest.prototype.open).toBe(originalXHROpen);
    logger.destroy();
  });

  it("returns an SDK with log, init, and destroy methods", async () => {
    const { initLogger } = await import("./index.js");
    const logger = initLogger({ captureNetwork: false });
    expect(typeof logger.log).toBe("function");
    expect(typeof logger.init).toBe("function");
    expect(typeof logger.destroy).toBe("function");
    logger.destroy();
  });

  it("log() creates and sends a log entry without throwing", async () => {
    const { initLogger } = await import("./index.js");
    const logger = initLogger({ captureNetwork: false });
    expect(() => logger.log("info", "test message")).not.toThrow();
    logger.destroy();
  });

  it("destroy() restores original fetch (Req 10.6 preview)", async () => {
    const { initLogger } = await import("./index.js");
    const logger = initLogger({ captureNetwork: true });
    expect(globalThis.fetch).not.toBe(originalFetch);
    logger.destroy();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
