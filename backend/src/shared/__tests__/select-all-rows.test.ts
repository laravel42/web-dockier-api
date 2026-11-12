/**
 * selectAllRows: PostgREST silently caps a response at `max_rows`, so callers that
 * must see every row (project teardown, rule overrides) page through it. Pinned:
 * everything is read even when the server cap is lower than the page asked for,
 * each page gets a fresh query, and an error stops the loop and is returned.
 */
import { describe, it, expect } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { selectAllRows } from "../supabase/query.js";

/** A fake table whose server answers at most `cap` rows per request, like max_rows. */
function table(rows: number[], cap: number, failAtOffset?: number) {
  const ranges: [number, number][] = [];
  const build = () => ({
    range: (from: number, to: number) => {
      ranges.push([from, to]);
      if (from === failAtOffset) {
        return Promise.resolve({ data: null, error: { message: "boom" } as PostgrestError });
      }
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null });
    },
  });
  return { build, ranges };
}

describe("selectAllRows", () => {
  it("reads every row past the per-request cap", async () => {
    const rows = Array.from({ length: 2362 }, (_, i) => i);
    const { build, ranges } = table(rows, 1000);

    const { data, error } = await selectAllRows(build);

    expect(error).toBeNull();
    expect(data).toEqual(rows);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2362, 3361]]);
  });

  it("still reads everything when the server cap is below the page size", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const { build } = table(rows, 300);

    expect((await selectAllRows(build)).data).toHaveLength(2500);
  });

  it("returns the error instead of a partial list passing as complete", async () => {
    const { build } = table(Array.from({ length: 1500 }, (_, i) => i), 1000, 1000);

    const { data, error } = await selectAllRows(build);

    expect(error?.message).toBe("boom");
    expect(data).toHaveLength(1000);
  });

  it("handles an empty result in one request", async () => {
    const { build, ranges } = table([], 1000);
    expect(await selectAllRows(build)).toEqual({ data: [], error: null });
    expect(ranges).toHaveLength(1);
  });
});
