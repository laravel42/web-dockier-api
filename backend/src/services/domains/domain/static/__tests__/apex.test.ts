/**
 * Apex-domain detection — Unit Tests
 *
 * This gate decides whether a domain is refused on AWS, so a false positive
 * blocks a domain that would have worked and a false negative produces a CNAME
 * instruction the user's DNS provider will reject at the zone root.
 */

import { describe, it, expect } from "vitest";
import { apexRefusalMessage, isApexDomain, normalizeHost } from "../apex.js";

describe("normalizeHost", () => {
  it("lowercases and strips a trailing dot", () => {
    expect(normalizeHost("WWW.Example.COM.")).toBe("www.example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHost("  example.com  ")).toBe("example.com");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeHost("")).toBe("");
    expect(normalizeHost("   ")).toBe("");
  });
});

describe("isApexDomain — standard TLDs", () => {
  it("treats a two-label domain as the apex", () => {
    expect(isApexDomain("example.com")).toBe(true);
    expect(isApexDomain("acme.io")).toBe(true);
    expect(isApexDomain("dockier.dev")).toBe(true);
  });

  it("treats a subdomain as not the apex", () => {
    expect(isApexDomain("www.example.com")).toBe(false);
    expect(isApexDomain("app.acme.io")).toBe(false);
  });

  it("treats a deep subdomain as not the apex", () => {
    expect(isApexDomain("a.b.c.example.com")).toBe(false);
  });

  it("is case- and trailing-dot-insensitive", () => {
    expect(isApexDomain("Example.COM.")).toBe(true);
    expect(isApexDomain("WWW.Example.com")).toBe(false);
  });
});

describe("isApexDomain — two-label public suffixes", () => {
  it("treats example.co.uk as the apex, not co.uk", () => {
    expect(isApexDomain("example.co.uk")).toBe(true);
    expect(isApexDomain("www.example.co.uk")).toBe(false);
  });

  it("handles the other listed multi-label suffixes", () => {
    expect(isApexDomain("example.com.au")).toBe(true);
    expect(isApexDomain("www.example.com.au")).toBe(false);
    expect(isApexDomain("example.co.jp")).toBe(true);
    expect(isApexDomain("shop.example.co.jp")).toBe(false);
  });

  it("does not mistake an unlisted three-label domain for an apex", () => {
    // .co.xyz is not a known two-label suffix, so this is a subdomain of
    // co.xyz — correctly not the apex.
    expect(isApexDomain("example.co.xyz")).toBe(false);
  });
});

describe("isApexDomain — edge cases", () => {
  it("returns false for a wildcard, which is not the apex itself", () => {
    expect(isApexDomain("*.example.com")).toBe(false);
  });

  it("returns false for a single label", () => {
    expect(isApexDomain("localhost")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isApexDomain("")).toBe(false);
    expect(isApexDomain("   ")).toBe(false);
  });
});

describe("apexRefusalMessage", () => {
  it("names the domain, the reason, and a concrete alternative", () => {
    const msg = apexRefusalMessage("example.com", "add-form");

    expect(msg).toContain("example.com");
    // The actionable suggestion.
    expect(msg).toContain("www.example.com");
    // The reason, not just "unsupported".
    expect(msg).toContain("CNAME");
    expect(msg).toMatch(/ALIAS|ANAME/);
  });

  it("names all four ways forward, because 'apex is unsupported' is false", () => {
    const msg = apexRefusalMessage("example.com", "add-form");

    expect(msg).toContain("www.example.com"); // a subdomain
    expect(msg).toMatch(/flattening/i); // provider-side flattening
    expect(msg).toMatch(/Route 53/); // an A record with Alias enabled
    expect(msg).toMatch(/GCP/); // the cloud where a root domain works natively
  });

  it("offers the checkbox only on the add form", () => {
    const addForm = apexRefusalMessage("example.com", "add-form");
    const persisted = apexRefusalMessage("example.com", "persisted");

    expect(addForm).toMatch(/tick the box below/i);
    // A persisted message has no checkbox to point at, so it must not imply one.
    expect(persisted).not.toMatch(/tick the box/i);
    expect(persisted).toMatch(/remove this domain and add it again/i);

    // The explanation is shared, so the two surfaces cannot drift apart.
    const shared = "which DNS does not permit at a domain root";
    expect(addForm).toContain(shared);
    expect(persisted).toContain(shared);
  });

  it("normalizes the domain it echoes back", () => {
    expect(apexRefusalMessage("Example.COM.", "add-form")).toContain("example.com");
  });
});
