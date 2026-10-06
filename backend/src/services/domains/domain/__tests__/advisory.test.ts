/**
 * The advisory must never cry wolf and never block an add.
 *
 * The case that matters most: publishing the routing record BEFORE adding the
 * domain is a sensible order, and telling that user their correct record "will
 * be replaced" would be a false alarm about the one thing they got right.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = string[] | Error;

let cnameAnswer: Answer = dnsError("ENODATA");
let a4Answer: Answer = dnsError("ENODATA");

function dnsError(code: string): Error {
  const err = new Error(code);
  (err as Error & { code: string }).code = code;
  return err;
}

const resolverOptions: Array<{ timeout?: number; tries?: number }> = [];

class FakeResolver {
  constructor(public options: { timeout?: number; tries?: number }) {
    resolverOptions.push(options);
  }

  async resolveCname(): Promise<string[]> {
    if (cnameAnswer instanceof Error) throw cnameAnswer;
    return cnameAnswer;
  }

  async resolve4(): Promise<string[]> {
    if (a4Answer instanceof Error) throw a4Answer;
    return a4Answer;
  }
}

vi.mock("node:dns", () => ({
  promises: { Resolver: FakeResolver },
}));

vi.mock("../../../../shared/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { existingRecordAdvisory } = await import("../dns-advisory.js");

const CDN = "d3d8fr298zex5t.cloudfront.net";

beforeEach(() => {
  cnameAnswer = dnsError("ENODATA");
  a4Answer = dnsError("ENODATA");
  resolverOptions.length = 0;
});

describe("existingRecordAdvisory", () => {
  it("says nothing when the CNAME already points at this project's CDN", async () => {
    // The incident's own path: the user published the routing record first.
    cnameAnswer = [`${CDN}.`];

    await expect(existingRecordAdvisory("www.example.com", CDN)).resolves.toBeUndefined();
  });

  it("warns when the CNAME points somewhere else", async () => {
    cnameAnswer = ["old-host.example.net"];

    const advisory = await existingRecordAdvisory("www.example.com", CDN);

    expect(advisory).toContain("old-host.example.net");
    expect(advisory).toContain("www.example.com");
  });

  it("says nothing when the A record already points at this project's CDN IP", async () => {
    a4Answer = ["34.111.22.33"];

    await expect(
      existingRecordAdvisory("example.com", "34.111.22.33"),
    ).resolves.toBeUndefined();
  });

  it("warns when the A record points somewhere else", async () => {
    a4Answer = ["203.0.113.10"];

    const advisory = await existingRecordAdvisory("example.com", "34.111.22.33");

    expect(advisory).toContain("203.0.113.10");
  });

  it("says nothing when nothing is published at all", async () => {
    cnameAnswer = dnsError("ENOTFOUND");
    a4Answer = dnsError("ENOTFOUND");

    await expect(existingRecordAdvisory("new.example.com", CDN)).resolves.toBeUndefined();
  });

  it("stays silent and does not throw when the resolver fails", async () => {
    // A resolver problem must never surface as an error on the add path.
    cnameAnswer = dnsError("ESERVFAIL");
    a4Answer = dnsError("ESERVFAIL");

    await expect(existingRecordAdvisory("www.example.com", CDN)).resolves.toBeUndefined();
  });

  it("warns on any answer when the route target is unknown", async () => {
    // Without a target we cannot tell a correct record from a stale one, so
    // the user gets the heads-up and decides.
    cnameAnswer = [`${CDN}.`];

    const advisory = await existingRecordAdvisory("www.example.com", null);

    expect(advisory).toContain(CDN);
  });

  it("prefers the CNAME answer over the A answer", async () => {
    cnameAnswer = ["old-host.example.net"];
    a4Answer = ["203.0.113.10"];

    const advisory = await existingRecordAdvisory("www.example.com", CDN);

    expect(advisory).toContain("old-host.example.net");
    expect(advisory).not.toContain("203.0.113.10");
  });

  it("normalizes the trailing dot and case before comparing", async () => {
    cnameAnswer = [`${CDN.toUpperCase()}.`];

    await expect(existingRecordAdvisory("WWW.Example.com.", CDN)).resolves.toBeUndefined();
  });

  it("bounds each query so a slow resolver cannot hold the request open", async () => {
    cnameAnswer = ["old-host.example.net"];

    await existingRecordAdvisory("www.example.com", CDN);

    // One try, not two: a retry would double the worst case for no benefit on
    // an advisory nobody is blocked on.
    expect(resolverOptions).toHaveLength(1);
    expect(resolverOptions[0]).toEqual({ timeout: 1200, tries: 1 });
  });
});
