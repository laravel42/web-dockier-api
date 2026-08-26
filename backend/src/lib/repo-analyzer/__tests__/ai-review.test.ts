import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiReviewDockerfile } from "../ai-review.js";
import { createRepoConfig } from "../types.js";
import type { DockerfileReviewInput } from "../ai-review.js";

// The module logs via the shared pino logger — silence it in tests.
vi.mock("../../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const MECHANICAL_DOCKERFILE = [
  "FROM public.ecr.aws/docker/library/node:20-slim AS builder",
  "WORKDIR /app",
  "COPY package.json package-lock.json* ./",
  "RUN npm ci || npm install",
  "COPY . .",
  "RUN npm run build",
  "",
  "FROM public.ecr.aws/docker/library/node:20-slim",
  "WORKDIR /app",
  "COPY --from=builder /app .",
  "ENV PORT=3000",
  "EXPOSE 3000",
  'CMD ["npm", "start"]',
].join("\n");

function baseInput(overrides: Partial<DockerfileReviewInput> = {}): DockerfileReviewInput {
  return {
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    dockerfile: MECHANICAL_DOCKERFILE,
    repoConfig: createRepoConfig({ runtime: "node", framework: "generic", packageManager: "npm" }),
    fileTree: ["package.json", "src/"],
    ...overrides,
  };
}

/** Build a fake OpenAI chat-completions response wrapping a JSON payload. */
function mockOpenAIResponse(payload: unknown, opts: { finishReason?: string } = {}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          finish_reason: opts.finishReason ?? "stop",
        },
      ],
    }),
  } as unknown as Response;
}

describe("aiReviewDockerfile", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns approved-unchanged when the AI approves", async () => {
    fetchMock.mockResolvedValue(mockOpenAIResponse({ approved: true, changes: [] }));

    const result = await aiReviewDockerfile(baseInput());

    expect(result.approved).toBe(true);
    expect(result.revised).toBe(false);
    expect(result.dockerfile).toBe(MECHANICAL_DOCKERFILE);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts a valid revision (FROM + EXPOSE, adequate length)", async () => {
    const revised = MECHANICAL_DOCKERFILE.replace("CMD", "USER node\nCMD");
    fetchMock.mockResolvedValue(
      mockOpenAIResponse({
        approved: false,
        revisedDockerfile: revised,
        changes: [{ what: "Added non-root USER", why: "Security best practice" }],
      }),
    );

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(true);
    expect(result.approved).toBe(false);
    expect(result.dockerfile).toContain("USER node");
    expect(result.changes).toEqual([{ what: "Added non-root USER", why: "Security best practice" }]);
  });

  it("treats a no-op revision (identical to original) as approved-unchanged", async () => {
    fetchMock.mockResolvedValue(
      mockOpenAIResponse({
        approved: false,
        revisedDockerfile: MECHANICAL_DOCKERFILE,
        changes: [],
      }),
    );

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.approved).toBe(true);
    expect(result.dockerfile).toBe(MECHANICAL_DOCKERFILE);
    expect(result.changes).toEqual([]);
  });

  it("rejects a revision missing FROM", async () => {
    const revised = "WORKDIR /app\nEXPOSE 3000\nCMD [\"npm\", \"start\"]\n".repeat(3);
    fetchMock.mockResolvedValue(mockOpenAIResponse({ approved: false, revisedDockerfile: revised }));

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.dockerfile).toBe(MECHANICAL_DOCKERFILE);
    expect(result.skipReason).toContain("missing FROM");
  });

  it("rejects a revision missing EXPOSE", async () => {
    const revised = MECHANICAL_DOCKERFILE.replace(/EXPOSE 3000\n/, "");
    fetchMock.mockResolvedValue(mockOpenAIResponse({ approved: false, revisedDockerfile: revised }));

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.skipReason).toContain("missing EXPOSE");
  });

  it("rejects a suspiciously short revision", async () => {
    const revised = "FROM node:20-slim\nEXPOSE 3000\n";
    fetchMock.mockResolvedValue(mockOpenAIResponse({ approved: false, revisedDockerfile: revised }));

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.skipReason).toContain("suspiciously short");
  });

  it("rejects a revision that introduces a secret", async () => {
    const revised = MECHANICAL_DOCKERFILE.replace(
      "ENV PORT=3000",
      "ENV PORT=3000\nENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY",
    );
    fetchMock.mockResolvedValue(mockOpenAIResponse({ approved: false, revisedDockerfile: revised }));

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.skipReason).toContain("possible secret");
  });

  it("passes through on a non-2xx HTTP response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ error: { message: "boom" } }),
    } as unknown as Response);

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.dockerfile).toBe(MECHANICAL_DOCKERFILE);
    expect(result.skipReason).toBeDefined();
  });

  it("passes through on a truncated response", async () => {
    fetchMock.mockResolvedValue(
      mockOpenAIResponse(
        { approved: false, revisedDockerfile: "FROM node\nEXPOSE 3000\n" },
        { finishReason: "length" },
      ),
    );

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.skipReason).toBeDefined();
  });

  it("passes through on malformed JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ choices: [{ message: { content: "not json {{{" }, finish_reason: "stop" }] }),
    } as unknown as Response);

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.dockerfile).toBe(MECHANICAL_DOCKERFILE);
  });

  it("passes through on a thrown fetch (network error / timeout)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await aiReviewDockerfile(baseInput());

    expect(result.revised).toBe(false);
    expect(result.dockerfile).toBe(MECHANICAL_DOCKERFILE);
  });

  it("does not call fetch when no API key is provided", async () => {
    const result = await aiReviewDockerfile(baseInput({ apiKey: "" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.revised).toBe(false);
    expect(result.skipReason).toBe("no API key");
  });
});
