/**
 * .env Parser — Unit Tests
 *
 * This is the single parser used by the deploy pipeline's env injection, the
 * secrets loader, and the Cloudflare push script, so the assertions below pin
 * the EXACT current output — including the surprising cases, which are marked
 * inline rather than fixed.
 */

import { describe, it, expect } from "vitest";
import { parseEnvContent, parseEnvRecord } from "../parse-env.js";

describe("parseEnvContent — basics", () => {
  it("parses a single pair", () => {
    expect(parseEnvContent("DB_HOST=localhost")).toEqual([{ name: "DB_HOST", value: "localhost" }]);
  });

  it("parses multiple pairs in order", () => {
    expect(parseEnvContent("A=1\nB=2\nC=3")).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
      { name: "C", value: "3" },
    ]);
  });

  it("returns an empty array for empty content", () => {
    expect(parseEnvContent("")).toEqual([]);
  });

  it("keeps an empty value", () => {
    expect(parseEnvContent("EMPTY=")).toEqual([{ name: "EMPTY", value: "" }]);
  });

  it("trims whitespace around the key and the value", () => {
    expect(parseEnvContent("  KEY  =  value  ")).toEqual([{ name: "KEY", value: "value" }]);
  });
});

describe("parseEnvContent — skipped lines", () => {
  it("skips blank and whitespace-only lines", () => {
    expect(parseEnvContent("A=1\n\n   \nB=2")).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
    ]);
  });

  it("skips full-line comments, including indented ones", () => {
    expect(parseEnvContent("# header\nA=1\n   # indented\nB=2")).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
    ]);
  });

  it("skips malformed lines with no '='", () => {
    expect(parseEnvContent("JUST_A_WORD\nA=1")).toEqual([{ name: "A", value: "1" }]);
  });

  it("skips a line with an empty key", () => {
    expect(parseEnvContent("=orphan\nA=1")).toEqual([{ name: "A", value: "1" }]);
  });
});

describe("parseEnvContent — values", () => {
  it("splits on the first '=' only, so '=' inside a value survives", () => {
    expect(parseEnvContent("URL=postgres://u:p@host/db?sslmode=require")).toEqual([
      { name: "URL", value: "postgres://u:p@host/db?sslmode=require" },
    ]);
  });

  it("strips surrounding double quotes", () => {
    expect(parseEnvContent('NAME="my app"')).toEqual([{ name: "NAME", value: "my app" }]);
  });

  it("strips surrounding single quotes", () => {
    expect(parseEnvContent("NAME='my app'")).toEqual([{ name: "NAME", value: "my app" }]);
  });

  it("leaves inner quotes alone", () => {
    expect(parseEnvContent('JSON={"a":1}')).toEqual([{ name: "JSON", value: '{"a":1}' }]);
  });

  it("strips an inline comment introduced by ' #'", () => {
    expect(parseEnvContent("A=value # trailing note")).toEqual([{ name: "A", value: "value" }]);
  });

  it("keeps a '#' that is not preceded by a space", () => {
    expect(parseEnvContent("COLOR=#ff0000")).toEqual([{ name: "COLOR", value: "#ff0000" }]);
    expect(parseEnvContent("TAG=v1#2")).toEqual([{ name: "TAG", value: "v1#2" }]);
  });

  // NOTE: suspected bug — inline-comment stripping runs AFTER the surrounding
  // quotes are removed, so a quoted value containing " #" is truncated. A
  // password like "p@ss #1" silently becomes "p@ss".
  it("truncates a quoted value at ' #' because quotes are stripped first", () => {
    expect(parseEnvContent('PASSWORD="p@ss #1"')).toEqual([{ name: "PASSWORD", value: "p@ss" }]);
  });

  // NOTE: suspected bug — `export ` is not recognised, so the prefix ends up in
  // the key name. `.env` files written with `export` produce unusable names.
  it("does not strip an 'export ' prefix — it becomes part of the key", () => {
    expect(parseEnvContent("export A=1")).toEqual([{ name: "export A", value: "1" }]);
  });
});

describe("parseEnvContent — line endings", () => {
  it("handles CRLF content", () => {
    expect(parseEnvContent("A=1\r\nB=2\r\n")).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
    ]);
  });

  it("handles a trailing newline", () => {
    expect(parseEnvContent("A=1\n")).toEqual([{ name: "A", value: "1" }]);
  });
});

describe("parseEnvContent — multi-line quoted values", () => {
  it("joins a double-quoted value spanning several lines", () => {
    const content = 'KEY="line1\nline2\nline3"';
    expect(parseEnvContent(content)).toEqual([{ name: "KEY", value: "line1\nline2\nline3" }]);
  });

  it("joins a single-quoted value spanning several lines", () => {
    expect(parseEnvContent("KEY='line1\nline2'")).toEqual([{ name: "KEY", value: "line1\nline2" }]);
  });

  it("continues parsing after a multi-line value closes", () => {
    expect(parseEnvContent('CERT="a\nb"\nNEXT=1')).toEqual([
      { name: "CERT", value: "a\nb" },
      { name: "NEXT", value: "1" },
    ]);
  });

  it("does not treat comment-looking lines inside a multi-line value as comments", () => {
    expect(parseEnvContent('KEY="a\n# not a comment\nb"')).toEqual([
      { name: "KEY", value: "a\n# not a comment\nb" },
    ]);
  });

  it("flushes an unterminated multi-line value at the end of the content", () => {
    expect(parseEnvContent('KEY="line1\nline2')).toEqual([{ name: "KEY", value: "line1\nline2" }]);
  });
});

describe("parseEnvContent — duplicates", () => {
  it("returns every occurrence of a repeated key, in order", () => {
    expect(parseEnvContent("A=1\nA=2")).toEqual([
      { name: "A", value: "1" },
      { name: "A", value: "2" },
    ]);
  });
});

describe("parseEnvRecord", () => {
  it("builds a flat record", () => {
    expect(parseEnvRecord("DB_HOST=localhost\nDB_PORT=5432")).toEqual({
      DB_HOST: "localhost",
      DB_PORT: "5432",
    });
  });

  it("lets the last occurrence of a duplicate key win", () => {
    expect(parseEnvRecord("A=1\nA=2\nA=3")).toEqual({ A: "3" });
  });

  it("returns an empty record for content with nothing parseable", () => {
    expect(parseEnvRecord("# only a comment\n\n   ")).toEqual({});
  });

  it("applies the same quote and comment handling as parseEnvContent", () => {
    expect(parseEnvRecord('NAME="my app"\nA=value # note')).toEqual({ NAME: "my app", A: "value" });
  });
});
