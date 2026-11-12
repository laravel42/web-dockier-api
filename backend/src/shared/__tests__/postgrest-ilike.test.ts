/**
 * Search terms reach PostgREST filters. Pinned: wildcards and the LIKE escape
 * character match literally, and an `.or()` value is double-quoted so `,` `(` `)`
 * cannot split the expression (unquoted, a comma made the request fail).
 */
import { describe, it, expect } from "vitest";
import { escapePostgrestLike, postgrestIlikeContains } from "../http/security.js";

describe("escapePostgrestLike", () => {
  it("escapes wildcards and the escape character, backslash first", () => {
    expect(escapePostgrestLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("postgrestIlikeContains", () => {
  it("quotes the value and keeps the surrounding wildcards", () => {
    expect(postgrestIlikeContains("laravel42/app")).toBe('"%laravel42/app%"');
  });

  it("keeps structural characters inside the quotes", () => {
    expect(postgrestIlikeContains("a,b(c)")).toBe('"%a,b(c)%"');
  });

  it("doubles backslashes for the quote layer on top of the LIKE layer", () => {
    // % → LIKE \% → quoted \\% ; " → \" ; \ → LIKE \\ → quoted \\\\
    expect(postgrestIlikeContains('5%"x\\')).toBe('"%5\\\\%\\"x\\\\\\\\%"');
  });
});
