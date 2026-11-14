import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nothing used to judge a late ping, so a heartbeat stayed "healthy" forever and
 * never alerted. The sweep flips overdue ones to "missed", once, and lets a ping
 * that lands mid-sweep win.
 */
const rows = vi.hoisted(() => ({ list: [] as Record<string, unknown>[], updated: [] as string[], raced: new Set<string>() }));

vi.mock("../../../shared/supabase/client.js", () => {
  const listQuery = () => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      range: async (from: number, to: number) => ({ data: rows.list.slice(from, to + 1), error: null }),
    };
    return q;
  };
  const updateQuery = () => {
    let id = "";
    const q = {
      eq: (col: string, v: string) => { if (col === "id") id = v; return q; },
      select: async () => {
        if (rows.raced.has(id)) return { data: [], error: null };
        rows.updated.push(id);
        return { data: [{ id }], error: null };
      },
    };
    return q;
  };
  return { supabaseAdmin: { from: () => ({ ...listQuery(), update: () => updateQuery() }) } };
});

const emit = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/events.js", () => ({ emit }));
const safeRecordActivity = vi.hoisted(() => vi.fn());
vi.mock("../domain/activity.js", () => ({ safeRecordActivity }));

const { markMissedHeartbeats, missedAt } = await import("../domain/heartbeats.js");

const NOW = Date.parse("2026-11-11T12:00:00Z");
const row = (id: string, lastPingMinutesAgo: number | null, frequency = "every_5_minutes") => ({
  id,
  organization_id: "t1",
  project_id: "p1",
  name: `hb-${id}`,
  frequency,
  grace_period: "after_1_minute",
  last_pinged_at: lastPingMinutesAgo === null ? null : new Date(NOW - lastPingMinutesAgo * 60_000).toISOString(),
});

describe("heartbeat sweep", () => {
  beforeEach(() => {
    rows.list = [];
    rows.updated = [];
    rows.raced.clear();
    emit.mockReset();
    safeRecordActivity.mockReset();
  });

  it("deadline is last ping + frequency + grace; custom and never-pinged are not judged", () => {
    expect(missedAt(row("a", 0))).toBe(NOW + 6 * 60_000);
    expect(missedAt(row("b", 0, "custom"))).toBeNull();
    expect(missedAt(row("c", null))).toBeNull();
  });

  it("marks only overdue heartbeats, records and notifies once each", async () => {
    rows.list = [row("late", 7), row("ontime", 5), row("custom", 999, "custom")];
    expect(await markMissedHeartbeats(NOW)).toBe(1);
    expect(rows.updated).toEqual(["late"]);
    expect(safeRecordActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: "heartbeat_missed" }));
    expect(emit).toHaveBeenCalledWith("notification:send", expect.objectContaining({ tenantId: "t1", title: "Heartbeat missed" }));
  });

  it("reports nothing when a ping changed the row between the read and the write", async () => {
    rows.list = [row("late", 7)];
    rows.raced.add("late");
    expect(await markMissedHeartbeats(NOW)).toBe(0);
    expect(emit).not.toHaveBeenCalled();
    expect(safeRecordActivity).not.toHaveBeenCalled();
  });
});
