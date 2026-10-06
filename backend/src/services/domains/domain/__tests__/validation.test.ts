/**
 * One message per problem.
 *
 * The regex this replaced answered every malformed input with "Invalid domain
 * name format", so a pasted URL, a typo and an unsupported wildcard were
 * indistinguishable to the person typing.
 */

import { describe, expect, it } from "vitest";

import { validateDomainName } from "../validation.js";

function messageFor(input: string): string {
  const result = validateDomainName(input);
  if (result.ok) throw new Error(`expected "${input}" to be rejected`);
  return result.message;
}

function nameFor(input: string): string {
  const result = validateDomainName(input);
  if (!result.ok) throw new Error(`expected "${input}" to be accepted: ${result.message}`);
  return result.name;
}

describe("validateDomainName — accepted", () => {
  it("accepts ordinary names", () => {
    expect(nameFor("www.example.com")).toBe("www.example.com");
    expect(nameFor("example.com")).toBe("example.com");
    expect(nameFor("a.b.c.example.co.uk")).toBe("a.b.c.example.co.uk");
    expect(nameFor("my-site.example.com")).toBe("my-site.example.com");
    expect(nameFor("v2.example.com")).toBe("v2.example.com");
  });

  it("accepts a punycode TLD as given", () => {
    // Converting Unicode would need a new dependency, and no requirement asks.
    expect(nameFor("example.xn--p1ai")).toBe("example.xn--p1ai");
  });

  it("normalizes case and a trailing dot so one domain is one row", () => {
    expect(nameFor("WWW.Example.com.")).toBe("www.example.com");
    expect(nameFor("  www.example.com  ")).toBe("www.example.com");
  });
});

describe("validateDomainName — one message per rule", () => {
  it("1. asks for a name when empty", () => {
    expect(messageFor("")).toMatch(/enter a domain name/i);
    expect(messageFor("   ")).toMatch(/enter a domain name/i);
  });

  it("2. names the scheme when a URL is pasted", () => {
    expect(messageFor("https://www.example.com")).toMatch(/without "http:\/\/" or "https:\/\/"/);
    expect(messageFor("http://example.com")).toMatch(/without "http:\/\/" or "https:\/\/"/);
  });

  it("3. names a path, query, port or space specifically", () => {
    expect(messageFor("www.example.com/blog")).toMatch(/without a path/i);
    expect(messageFor("www.example.com?a=1")).toMatch(/without a query string/i);
    expect(messageFor("www.example.com:8080")).toMatch(/without a port number/i);
    expect(messageFor("www example.com")).toMatch(/cannot contain spaces/i);
  });

  it("4. rejects an over-long name", () => {
    const tooLong = `${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.example.com`;
    expect(messageFor(tooLong)).toMatch(/longer than 253 characters/i);
  });

  it("5. suggests an extension when there is no dot", () => {
    expect(messageFor("example")).toMatch(/include the extension/i);
    expect(messageFor("example")).toContain("example.com");
  });

  it("6. names an empty part", () => {
    expect(messageFor("www..example.com")).toMatch(/empty part|two dots/i);
    expect(messageFor(".example.com")).toMatch(/empty part|two dots/i);
  });

  it("7. names the over-long label", () => {
    const label = "a".repeat(64);
    expect(messageFor(`${label}.example.com`)).toMatch(/at most 63 characters/i);
  });

  it("8. names the label with the stray hyphen", () => {
    expect(messageFor("-www.example.com")).toMatch(/cannot start or end with a hyphen/i);
    expect(messageFor("www-.example.com")).toMatch(/cannot start or end with a hyphen/i);
  });

  it("9. explains wildcards BEFORE complaining about the character", () => {
    // Rule order is observable here: the charset rule would also reject `*`,
    // but "that character is not allowed" is true and useless.
    const message = messageFor("*.example.com");
    expect(message).toMatch(/wildcard domains are not supported/i);
    expect(message).not.toMatch(/characters that are not allowed/i);
    expect(message).toMatch(/individually/i);
  });

  it("10. names the offending label for a bad charset", () => {
    expect(messageFor("www.exämple.com")).toMatch(/characters that are not allowed/i);
    expect(messageFor("www.exämple.com")).toMatch(/punycode/i);
    expect(messageFor("www_site.example.com")).toMatch(/characters that are not allowed/i);
  });

  it("11. rejects a numeric or malformed extension", () => {
    expect(messageFor("example.123")).toMatch(/not a valid domain extension/i);
    expect(messageFor("example.c")).toMatch(/not a valid domain extension/i);
  });
});
