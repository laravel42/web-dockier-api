import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { wrapFetch, type ObservabilitySDK } from "../index.js";

/**
 * Property-based tests for SDK self-logging prevention.
 *
 * **Validates: Requirement 10.5**
 *
 * Property 8: SDK Self-Logging Prevention
 * For any fetch request that includes the `X-Observability-SDK` marker header,
 * the Frontend_SDK's wrapped fetch SHALL not create a LogEntry for that request,
 * preventing infinite logging loops.
 */

const SDK_MARKER = "X-Observability-SDK";

/** Arbitrary for a valid URL string. */
const urlArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("http", "https"),
    fc.stringMatching(/^[a-z][a-z0-9]{1,15}$/),
    fc.stringMatching(/^\/[a-z0-9/]{0,30}$/),
  )
  .map(([scheme, host, path]) => `${scheme}://${host}.example.com${path}`);

/** Arbitrary for an HTTP method. */
const methodArb: fc.Arbitrary<string> = fc.constantFrom(
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
);

/** Arbitrary for an optional request body (string or undefined). */
const bodyArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.string({ minLength: 0, maxLength: 500 }),
);

/** Arbitrary for the SDK marker header value (any truthy string). */
const markerValueArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 10 });

/** Arbitrary for a response status code. */
const statusArb: fc.Arbitrary<number> = fc.integer({ min: 200, max: 599 });

/**
 * Creates a minimal mock Response object that avoids Node.js Response
 * constructor restrictions on null-body status codes.
 */
function createMockResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    body: null,
    bodyUsed: false,
    clone: () => createMockResponse(status),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/**
 * Helper: creates a mock SDK and returns the sdk + log spy.
 */
function createMockSDK() {
  const logSpy = vi.fn();
  const sdk: ObservabilitySDK = {
    init: vi.fn(),
    destroy: vi.fn(),
    log: logSpy,
  };
  return { sdk, logSpy };
}

describe("SDK Self-Logging Prevention — Property 8", () => {
  it("does NOT call sdk.log() when X-Observability-SDK header is present (plain object)", async () => {
    await fc.assert(
      fc.asyncProperty(
        urlArb,
        methodArb,
        bodyArb,
        markerValueArb,
        statusArb,
        async (url, method, body, markerValue, status) => {
          const { sdk, logSpy } = createMockSDK();
          const mockResponse = createMockResponse(status);
          const originalFetch = vi.fn().mockResolvedValue(mockResponse);

          const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
          const result = await wrapped(url, {
            method,
            body,
            headers: { [SDK_MARKER]: markerValue },
          });

          // sdk.log must NOT be called
          expect(logSpy).not.toHaveBeenCalled();
          // original fetch IS called (request goes through)
          expect(originalFetch).toHaveBeenCalledOnce();
          // response is returned unchanged
          expect(result).toBe(mockResponse);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does NOT call sdk.log() when X-Observability-SDK header is in a Headers instance", async () => {
    await fc.assert(
      fc.asyncProperty(
        urlArb,
        methodArb,
        bodyArb,
        markerValueArb,
        statusArb,
        async (url, method, body, markerValue, status) => {
          const { sdk, logSpy } = createMockSDK();
          const mockResponse = createMockResponse(status);
          const originalFetch = vi.fn().mockResolvedValue(mockResponse);

          const headers = new Headers();
          headers.set(SDK_MARKER, markerValue);

          const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
          const result = await wrapped(url, { method, body, headers });

          expect(logSpy).not.toHaveBeenCalled();
          expect(originalFetch).toHaveBeenCalledOnce();
          expect(result).toBe(mockResponse);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does NOT call sdk.log() when X-Observability-SDK header is in array-of-tuples", async () => {
    await fc.assert(
      fc.asyncProperty(
        urlArb,
        methodArb,
        bodyArb,
        markerValueArb,
        statusArb,
        async (url, method, body, markerValue, status) => {
          const { sdk, logSpy } = createMockSDK();
          const mockResponse = createMockResponse(status);
          const originalFetch = vi.fn().mockResolvedValue(mockResponse);

          const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
          const result = await wrapped(url, {
            method,
            body,
            headers: [[SDK_MARKER, markerValue]],
          });

          expect(logSpy).not.toHaveBeenCalled();
          expect(originalFetch).toHaveBeenCalledOnce();
          expect(result).toBe(mockResponse);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("DOES call sdk.log() when X-Observability-SDK header is absent", async () => {
    await fc.assert(
      fc.asyncProperty(
        urlArb,
        methodArb,
        bodyArb,
        statusArb,
        async (url, method, body, status) => {
          const { sdk, logSpy } = createMockSDK();
          const mockResponse = createMockResponse(status);
          const originalFetch = vi.fn().mockResolvedValue(mockResponse);

          const wrapped = wrapFetch(sdk, originalFetch as unknown as typeof fetch);
          const result = await wrapped(url, { method, body });

          // sdk.log MUST be called for non-SDK traffic
          expect(logSpy).toHaveBeenCalledOnce();
          // original fetch IS called
          expect(originalFetch).toHaveBeenCalledOnce();
          // response is returned unchanged
          expect(result).toBe(mockResponse);
        },
      ),
      { numRuns: 100 },
    );
  });
});
