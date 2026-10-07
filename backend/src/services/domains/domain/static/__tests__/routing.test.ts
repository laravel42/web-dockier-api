/**
 * The routing check, and the guidance it produces.
 *
 * The apex cases are the point of this file. A plain CNAME at a zone root is
 * forbidden by DNS, so telling a user to add one is advice their registrar will
 * reject — and the old code did exactly that, from two separate branches.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let cnameAnswer: string[] | Error = [];
/** Keyed by host, so the flattening comparison can be driven. */
let a4Answers: Record<string, string[] | Error> = {};

function dnsError(code: string): Error {
  const err = new Error(code);
  (err as Error & { code: string }).code = code;
  return err;
}

vi.mock("node:dns", () => ({
  promises: {
    resolveCname: async () => {
      if (cnameAnswer instanceof Error) throw cnameAnswer;
      return cnameAnswer;
    },
    resolve4: async (host: string) => {
      const answer = a4Answers[host];
      if (answer === undefined) throw dnsError("ENODATA");
      if (answer instanceof Error) throw answer;
      return answer;
    },
  },
}));

const { verifyRoutingRecordAws, missingRoutingRecordMessage, isValidationRecordVisible } =
  await import("../routing.js");

const CDN = "d3d8fr298zex5t.cloudfront.net";

beforeEach(() => {
  cnameAnswer = [];
  a4Answers = {};
});

describe("verifyRoutingRecordAws", () => {
  it("verifies a CNAME pointing at the CDN, trailing dot and case included", async () => {
    cnameAnswer = [`${CDN.toUpperCase()}.`];

    const check = await verifyRoutingRecordAws("www.example.com", CDN);

    expect(check.outcome).toBe("verified");
    expect(check.serverIp).toBe(CDN);
  });

  it("reports a CNAME pointing elsewhere as mismatched", async () => {
    cnameAnswer = ["old.example.net"];

    const check = await verifyRoutingRecordAws("www.example.com", CDN);

    expect(check.outcome).toBe("mismatched");
    expect(check.resolved).toBe("old.example.net");
    expect(check.message).toContain(CDN);
  });

  it("reports an empty CNAME answer as missing", async () => {
    cnameAnswer = [];

    const check = await verifyRoutingRecordAws("www.example.com", CDN);

    expect(check.outcome).toBe("missing");
  });

  it("verifies a flattened apex when the A sets overlap", async () => {
    cnameAnswer = dnsError("ENODATA");
    a4Answers = { "example.com": ["13.249.47.4"], [CDN]: ["13.249.47.4", "13.249.47.5"] };

    const check = await verifyRoutingRecordAws("example.com", CDN);

    expect(check.outcome).toBe("verified");
    expect(check.message).toMatch(/flattened ALIAS/i);
  });

  it("reports INCONCLUSIVE for an apex whose A set does not overlap", async () => {
    // Not `missing`. CloudFront's edge addresses rotate between queries, so a
    // non-overlapping set means unknown. Reporting it as missing would strand
    // a correctly configured apex.
    cnameAnswer = dnsError("ENODATA");
    a4Answers = { "example.com": ["203.0.113.9"], [CDN]: ["13.249.47.4"] };

    const check = await verifyRoutingRecordAws("example.com", CDN);

    expect(check.outcome).toBe("inconclusive");
    expect(check.message).toMatch(/could not be confirmed either way/i);
  });

  it("reports MISSING for a subdomain with no CNAME — the apex rule does not leak", async () => {
    cnameAnswer = dnsError("ENODATA");
    a4Answers = {};

    const check = await verifyRoutingRecordAws("www.example.com", CDN);

    expect(check.outcome).toBe("missing");
  });

  it("surfaces a non-NXDOMAIN resolver failure with its error", async () => {
    cnameAnswer = dnsError("ESERVFAIL");

    const check = await verifyRoutingRecordAws("www.example.com", CDN);

    expect(check.outcome).toBe("missing");
    expect(check.error).toBeTruthy();
  });

  it("always carries serverIp, on every outcome", async () => {
    // The frontend reads it unconditionally.
    const outcomes = [] as string[];

    cnameAnswer = [`${CDN}.`];
    outcomes.push((await verifyRoutingRecordAws("www.example.com", CDN)).serverIp);
    cnameAnswer = ["elsewhere.example.net"];
    outcomes.push((await verifyRoutingRecordAws("www.example.com", CDN)).serverIp);
    cnameAnswer = [];
    outcomes.push((await verifyRoutingRecordAws("www.example.com", CDN)).serverIp);
    cnameAnswer = dnsError("ESERVFAIL");
    outcomes.push((await verifyRoutingRecordAws("www.example.com", CDN)).serverIp);

    expect(outcomes).toEqual([CDN, CDN, CDN, CDN]);
  });
});

describe("missingRoutingRecordMessage", () => {
  it("never tells an apex to add a CNAME", async () => {
    // The literal bug: this advice produced `CNAME Err 1` at the registrar.
    const message = missingRoutingRecordMessage("example.com", CDN, { propagating: true });

    expect(message).not.toMatch(/add a cname/i);
    expect(message).toMatch(/ALIAS, ANAME or CNAME-flattening/);
    expect(message).toMatch(/Route 53/);
  });

  it("keeps today's guidance verbatim for a subdomain", async () => {
    const message = missingRoutingRecordMessage("www.example.com", CDN, { propagating: true });

    expect(message).toContain("has no CNAME record yet");
    expect(message).toContain(`Add a CNAME pointing at ${CDN}`);
    expect(message).toMatch(/few minutes/);
  });

  it("drops the propagation note when it does not apply", async () => {
    const message = missingRoutingRecordMessage("www.example.com", CDN, { propagating: false });

    expect(message).toContain("has no CNAME record.");
    expect(message).not.toMatch(/few minutes/);
  });
});

describe("isValidationRecordVisible", () => {
  it("is true when the record resolves and false when it does not", async () => {
    cnameAnswer = ["_x9y8z7.acm-validations.aws"];
    await expect(isValidationRecordVisible("_a1b2.www.example.com")).resolves.toBe(true);

    cnameAnswer = dnsError("ENOTFOUND");
    await expect(isValidationRecordVisible("_a1b2.www.example.com")).resolves.toBe(false);

    cnameAnswer = [];
    await expect(isValidationRecordVisible("_a1b2.www.example.com")).resolves.toBe(false);
  });
});
