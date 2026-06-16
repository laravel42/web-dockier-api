import { describe, expect, it } from "vitest";
import { parseApiTimestamp, timeAgo } from "../utils/timeAgo";

describe("parseApiTimestamp", () => {
  it("treats ISO strings without timezone as UTC", () => {
    const parsed = parseApiTimestamp("2026-06-08T12:00:00");
    expect(parsed.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });

  it("parses Postgres-style timestamps with offset", () => {
    const parsed = parseApiTimestamp("2026-06-08 12:00:00+00");
    expect(parsed.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });

  it("parses unix epoch seconds", () => {
    const parsed = parseApiTimestamp("1700000000");
    expect(parsed.getTime()).toBe(1_700_000_000_000);
  });
});

describe("timeAgo", () => {
  it("returns distinct labels for timestamps hours apart", () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 3_600_000).toISOString().replace("Z", "");
    const fiveHoursAgo = new Date(now - 5 * 3_600_000).toISOString().replace("Z", "");

    expect(timeAgo(twoHoursAgo)).toBe("2h ago");
    expect(timeAgo(fiveHoursAgo)).toBe("5h ago");
  });

  it("returns empty string for invalid input", () => {
    expect(timeAgo("")).toBe("");
    expect(timeAgo("not-a-date")).toBe("");
  });
});
