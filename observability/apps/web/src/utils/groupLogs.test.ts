import { describe, it, expect } from "vitest";
import { groupLogEntries } from "./groupLogs";
import type { LogEntry } from "@observability/types";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "info",
    source: "proxy",
    group: "default",
    message: "test",
    ...overrides,
  };
}

describe("groupLogEntries", () => {
  it("returns empty array for empty input", () => {
    expect(groupLogEntries([])).toEqual([]);
  });

  it("groups all entries under one group when they share the same group", () => {
    const entries = [
      makeEntry({ group: "api" }),
      makeEntry({ group: "api" }),
      makeEntry({ group: "api" }),
    ];
    const groups = groupLogEntries(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("api");
    expect(groups[0].entries).toHaveLength(3);
  });

  it("creates separate groups for different group values", () => {
    const entries = [
      makeEntry({ group: "api" }),
      makeEntry({ group: "auth" }),
      makeEntry({ group: "api" }),
    ];
    const groups = groupLogEntries(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0].group).toBe("api");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].group).toBe("auth");
    expect(groups[1].entries).toHaveLength(1);
  });

  it("preserves insertion order within each group", () => {
    const e1 = makeEntry({ group: "g1", message: "first" });
    const e2 = makeEntry({ group: "g1", message: "second" });
    const e3 = makeEntry({ group: "g1", message: "third" });
    const groups = groupLogEntries([e1, e2, e3]);
    expect(groups[0].entries[0].message).toBe("first");
    expect(groups[0].entries[1].message).toBe("second");
    expect(groups[0].entries[2].message).toBe("third");
  });

  it("preserves group order based on first appearance", () => {
    const entries = [
      makeEntry({ group: "b" }),
      makeEntry({ group: "a" }),
      makeEntry({ group: "c" }),
    ];
    const groups = groupLogEntries(entries);
    expect(groups.map((g) => g.group)).toEqual(["b", "a", "c"]);
  });
});
