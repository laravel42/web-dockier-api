import { describe, it, expect } from "vitest";
import { parse } from "dotenv";
import { formatDokployEnv, formatDokployEnvLine, EnvValueNotRepresentableError } from "../env-text.js";

/** What Dokploy ends up with: the text parsed by dotenv, as `prepareEnvironmentVariables` does. */
function roundTrip(vars: Array<{ name: string; value: string }>): Record<string, string> {
  return parse(formatDokployEnv(vars));
}

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----";

describe("formatDokployEnv", () => {
  it.each([
    ["plain", "abc"],
    ["spaces inside", "a b c"],
    ["empty", ""],
    ["url with query", "https://x.test/p?a=1&b=2"],
    ["dollar", "cost$5"],
    ["a hash", "pa#ss"],
    ["hash after a space", "value #not-a-comment"],
    ["a pem key", PEM],
    ["double quotes inside", 'say "hi"'],
    ["single quote inside", "it's"],
    ["both quote kinds", `it's "x"`],
    ["starts with a quote", "'quoted'"],
    ["leading and trailing space", "  padded  "],
    ["a windows path", "C:\\new\\temp"],
    ["json", '{"a":1,"b":"two # three"}'],
  ])("survives dotenv: %s", (_label, value) => {
    expect(roundTrip([{ name: "X", value }])).toEqual({ X: value });
  });

  it("keeps ordinary values bare, so most deploys send the same text as before", () => {
    expect(formatDokployEnv([{ name: "A", value: "1" }, { name: "B", value: "two words" }])).toBe("A=1\nB=two words");
  });

  it("a value with a line break cannot add a variable of its own", () => {
    const parsed = roundTrip([{ name: "NOTE", value: "hello\nEVIL=1" }, { name: "OK", value: "yes" }]);
    expect(parsed).toEqual({ NOTE: "hello\nEVIL=1", OK: "yes" });
  });

  it("keeps variables independent of each other", () => {
    const parsed = roundTrip([
      { name: "A", value: "pa#ss" },
      { name: "B", value: PEM },
      { name: "C", value: "plain" },
    ]);
    expect(parsed).toEqual({ A: "pa#ss", B: PEM, C: "plain" });
  });

  it("names the variable, never its value, when no quoting can carry it", () => {
    const value = `a#'b"c\`d`;
    let error: unknown;
    try {
      formatDokployEnvLine("SECRET_THING", value);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvValueNotRepresentableError);
    expect((error as Error).message).toContain("SECRET_THING");
    expect((error as Error).message).not.toContain(value);
  });
});
