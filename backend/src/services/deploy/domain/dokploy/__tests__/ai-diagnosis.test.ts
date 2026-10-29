/**
 * AI build-failure diagnosis.
 *
 * The redaction tests matter most: this is the only place in the deploy path
 * that sends a build log off our network, and a build log echoes environment
 * values — a failing `--build-arg`, a framework printing its config, a stack
 * trace carrying a connection string.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

// createTestEnv() covers only the always-required vars, so the two OpenAI
// settings this module reads are added explicitly and kept mutable (the tests
// below clear the key to assert the module no-ops without one).
const env: Record<string, unknown> = {
  ...createTestEnv(),
  OPENAI_API_KEY: "sk-test-key",
  OPENAI_MODEL: "gpt-4o-mini",
};
vi.mock("../../../../../shared/config.js", () => ({ env }));

const { diagnoseBuildFailure, redact } = await import("../stages/ai-diagnosis.js");

const fetchMock = vi.fn();

/** A reply in the shape the module expects. */
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function completion(content: unknown) {
  return reply({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

const LOG = `
#12 [build 5/6] RUN pnpm run build
#12 9.882 vite v5.4.2 building for production...
#12 44.21 error during build: Cannot find module './missing-file'
#12 ERROR: process "/bin/sh -c pnpm run build" did not complete successfully: exit code: 1
`.trim();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  env.OPENAI_API_KEY = "sk-test-key";
  env.OPENAI_MODEL = "gpt-4o-mini";
  fetchMock.mockResolvedValue(
    completion({ summary: "The build failed in `pnpm run build`.", suggestion: "Restore the missing module." }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("diagnoseBuildFailure", () => {
  it("returns a summary and a suggestion", async () => {
    expect(await diagnoseBuildFailure({ logTail: LOG })).toEqual({
      summary: "The build failed in `pnpm run build`.",
      suggestion: "Restore the missing module.",
    });
  });

  it("asks for JSON at temperature 0", async () => {
    await diagnoseBuildFailure({ logTail: LOG });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("does nothing without an API key", async () => {
    env.OPENAI_API_KEY = "";
    expect(await diagnoseBuildFailure({ logTail: LOG })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a log too short to reason about", async () => {
    expect(await diagnoseBuildFailure({ logTail: "boom" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes the runtime hint as context when given", async () => {
    await diagnoseBuildFailure({ logTail: LOG, hint: { buildType: "railpack", framework: "astro" } });

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content;
    expect(prompt).toContain("railpack");
    expect(prompt).toContain("astro");
  });

  it("constrains the model to remedies the user can actually apply", async () => {
    // The Dokploy-hosted alternative suggested webpack tooling for a Vite build
    // and "check your CI/CD configuration" — neither of which a Dockier user
    // has access to.
    await diagnoseBuildFailure({ logTail: LOG });

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content;
    expect(prompt).toMatch(/NO access to the build server/i);
    expect(prompt).toMatch(/never suggest/i);
  });
});

describe("diagnoseBuildFailure — never throws", () => {
  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: "rate limited" } }, 429));
    expect(await diagnoseBuildFailure({ logTail: LOG })).toBeNull();
  });

  it("returns null on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await diagnoseBuildFailure({ logTail: LOG })).toBeNull();
  });

  it("returns null on a timeout", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    expect(await diagnoseBuildFailure({ logTail: LOG, timeoutMs: 1 })).toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not json at all", { status: 200 }));
    expect(await diagnoseBuildFailure({ logTail: LOG })).toBeNull();
  });

  it("returns null when the model omits a field", async () => {
    fetchMock.mockResolvedValue(completion({ summary: "Something broke." }));
    expect(await diagnoseBuildFailure({ logTail: LOG })).toBeNull();
  });

  it("rejects prose too long for a log line", async () => {
    // The deploy log is a line stream and the wizard shows one line, so an
    // unbounded essay has to be refused rather than rendered.
    fetchMock.mockResolvedValue(completion({ summary: "x".repeat(500), suggestion: "fix it please" }));
    expect(await diagnoseBuildFailure({ logTail: LOG })).toBeNull();
  });

  it("flattens newlines out of an otherwise valid answer", async () => {
    fetchMock.mockResolvedValue(
      completion({ summary: "Line one\nline two.", suggestion: "Do\tthe thing." }),
    );
    expect(await diagnoseBuildFailure({ logTail: LOG })).toEqual({
      summary: "Line one line two.",
      suggestion: "Do the thing.",
    });
  });
});

describe("redact", () => {
  it("removes a private key block", () => {
    const out = redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEssh\n-----END RSA PRIVATE KEY-----");
    expect(out).toBe("[redacted private key]");
    expect(out).not.toContain("MIIEssh");
  });

  it("removes credential-named assignments, whatever the separator", () => {
    const out = redact("DB_PASSWORD=hunter2\nAPI_KEY: abc123\nMY_SECRET_TOKEN=zzz");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("zzz");
  });

  it("removes credentials embedded in a URL", () => {
    const out = redact("connecting to postgres://admin:s3cret@db.internal:5432/app");
    expect(out).toContain("postgres://[redacted]@db.internal:5432/app");
    expect(out).not.toContain("s3cret");
  });

  it("removes recognisable provider key shapes", () => {
    const out = redact("AKIAIOSFODNN7EXAMPLE and sk-abcdefghijklmnopqrstuvwxyz and ghp_abcdefghijklmnopqrstuvwxyz1");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).not.toMatch(/sk-abcdefghij/);
    expect(out).not.toMatch(/ghp_abcdefghij/);
  });

  it("removes a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r";
    expect(redact(`token=${jwt}`)).not.toContain("eyJzdWIi");
  });

  it("leaves ordinary build output alone", () => {
    // Over-redaction would strip the very error we are asking about.
    expect(redact(LOG)).toBe(LOG);
  });

  it("redacts before the log is sent", async () => {
    vi.stubGlobal("fetch", fetchMock);
    env.OPENAI_API_KEY = "sk-test-key";
    fetchMock.mockResolvedValue(completion({ summary: "Build failed early.", suggestion: "Set the variable." }));

    await diagnoseBuildFailure({ logTail: `${LOG}\nDATABASE_PASSWORD=hunter2 was used` });

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content;
    expect(prompt).not.toContain("hunter2");
  });
});
