/**
 * Both matrices, cell by cell.
 *
 * Asserting ALL statuses rather than just which stage is current, because the
 * obvious position-based rule is wrong on AWS and nothing but a full-row
 * assertion catches that.
 */

import { describe, expect, it } from "vitest";

import { buildAwsStages, buildGcpStages, type CertSnapshot } from "../stages.js";

function snapshot(overrides: Partial<CertSnapshot> = {}): CertSnapshot {
  return {
    domainName: "www.example.com",
    verificationState: "pending",
    status: "pending",
    verificationMessage: null,
    ...overrides,
  };
}

const statusesOf = (view: { stages: Array<{ status: string }> }) =>
  view.stages.map((s) => s.status);

describe("buildAwsStages — the matrix", () => {
  it("pending", () => {
    expect(statusesOf(buildAwsStages(snapshot({ verificationState: "pending" })))).toEqual([
      "done",
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("awaiting_dns before issuance → stage (c)", () => {
    expect(
      statusesOf(buildAwsStages(snapshot({ verificationState: "awaiting_dns", status: "pending" }))),
    ).toEqual(["done", "done", "current", "pending", "pending", "pending", "pending"]);
  });

  it("provisioning", () => {
    expect(statusesOf(buildAwsStages(snapshot({ verificationState: "provisioning" })))).toEqual([
      "done",
      "done",
      "done",
      "current",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("attaching", () => {
    expect(
      statusesOf(buildAwsStages(snapshot({ verificationState: "attaching", status: "active" }))),
    ).toEqual(["done", "done", "done", "done", "pending", "current", "pending"]);
  });

  it("THE NON-MONOTONIC ROW: awaiting_dns + active gives (e) current and (f) done", () => {
    // The attach really has finished — that is what issued the certificate and
    // put the alias on the distribution. Showing (f) as anything else would
    // tell the user Dockier still owes them work when the only outstanding
    // action is theirs.
    const view = buildAwsStages(snapshot({ verificationState: "awaiting_dns", status: "active" }));

    expect(statusesOf(view)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
      "done",
      "pending",
    ]);
    expect(view.stages[4].id).toBe("publish-routing");
    expect(view.stages[5].id).toBe("attaching");
  });

  it("live", () => {
    expect(statusesOf(buildAwsStages(snapshot({ verificationState: "live", status: "active" })))).toEqual(
      ["done", "done", "done", "done", "done", "done", "done"],
    );
  });
});

describe("buildAwsStages — status is the sole discriminator", () => {
  it("picks (c) or (e) on status alone, with everything else identical", () => {
    // `attach_started_at` is deliberately absent from CertSnapshot: it is the
    // current phase's start and is re-stamped on every phase entry, so it
    // carries no information about which phase this is.
    const pre = buildAwsStages(snapshot({ verificationState: "awaiting_dns", status: "pending" }));
    const post = buildAwsStages(snapshot({ verificationState: "awaiting_dns", status: "active" }));

    const currentOf = (v: typeof pre) => v.stages.find((s) => s.status === "current")?.id;

    expect(currentOf(pre)).toBe("publish-validation");
    expect(currentOf(post)).toBe("publish-routing");
  });
});

describe("buildAwsStages — owners and ETAs", () => {
  it("assigns the user's stages to `you` and the provider's to `aws`", () => {
    const view = buildAwsStages(snapshot({ verificationState: "pending" }));
    const owners = Object.fromEntries(view.stages.map((s) => [s.id, s.owner]));

    expect(owners["added"]).toBe("dockier");
    expect(owners["requested"]).toBe("dockier");
    expect(owners["publish-validation"]).toBe("you");
    expect(owners["validating"]).toBe("aws");
    expect(owners["publish-routing"]).toBe("you");
    expect(owners["attaching"]).toBe("aws");
    // The final "serving" stage is nobody's action.
    expect(owners["serving"]).toBeUndefined();
  });

  it("gives every waiting stage a realistic ETA", () => {
    const view = buildAwsStages(snapshot({ verificationState: "pending" }));
    const etas = Object.fromEntries(view.stages.map((s) => [s.id, s.eta]));

    expect(etas["requested"]).toMatch(/seconds/);
    expect(etas["validating"]).toMatch(/minutes/);
    expect(etas["attaching"]).toMatch(/5-20 minutes/);
  });

  it("keeps the renewal note on the validation stage", () => {
    const view = buildAwsStages(snapshot({ verificationState: "pending" }));
    const stage = view.stages.find((s) => s.id === "publish-validation");

    expect(stage?.detail).toMatch(/renew/i);
  });

  it("surfaces the row's message on whichever stage is current", () => {
    const view = buildAwsStages(
      snapshot({
        verificationState: "awaiting_dns",
        status: "active",
        verificationMessage: "the routing record still does not point here",
      }),
    );

    const current = view.stages.find((s) => s.status === "current");
    expect(current?.detail).toBe("the routing record still does not point here");
  });
});

describe("terminal states", () => {
  it("replaces the trailing stages with one terminal stage, keeping (a) and (b) done", () => {
    for (const state of ["failed", "timed_out"] as const) {
      const view = buildAwsStages(
        snapshot({ verificationState: state, verificationMessage: "the reason" }),
      );

      expect(statusesOf(view)).toEqual(["done", "done", "failed"]);
      expect(view.stages[2].detail).toBe("the reason");
      // One Resume button, not a menu of guesses.
      expect(view.resumable).toBe(true);
    }
  });

  it("labels a timeout differently from a failure", () => {
    expect(buildAwsStages(snapshot({ verificationState: "timed_out" })).stages[2].label).toBe(
      "Timed out",
    );
    expect(buildAwsStages(snapshot({ verificationState: "failed" })).stages[2].label).toBe("Failed");
  });

  it("is not resumable while the attachment is still progressing", () => {
    expect(buildAwsStages(snapshot({ verificationState: "provisioning" })).resumable).toBe(false);
    expect(buildAwsStages(snapshot({ verificationState: "live" })).resumable).toBe(false);
  });
});

describe("buildGcpStages — the matrix", () => {
  it("covers all four reachable states", () => {
    expect(statusesOf(buildGcpStages(snapshot({ verificationState: "pending" })))).toEqual([
      "done",
      "current",
      "pending",
      "pending",
      "pending",
    ]);
    expect(statusesOf(buildGcpStages(snapshot({ verificationState: "awaiting_dns" })))).toEqual([
      "done",
      "done",
      "current",
      "pending",
      "pending",
    ]);
    expect(statusesOf(buildGcpStages(snapshot({ verificationState: "provisioning" })))).toEqual([
      "done",
      "done",
      "done",
      "current",
      "pending",
    ]);
    expect(statusesOf(buildGcpStages(snapshot({ verificationState: "live" })))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("never emits a validation-record stage", () => {
    // Google validates against the A record itself; there is no second record.
    const view = buildGcpStages(snapshot({ verificationState: "awaiting_dns" }));

    expect(view.stages).toHaveLength(5);
    expect(view.stages.map((s) => s.id)).not.toContain("publish-validation");
    expect(view.stages.find((s) => s.owner === "google")).toBeDefined();
  });

  it("is fully monotonic — status is not a discriminator", () => {
    // No post-attach wait: Google cannot issue until the A record is live.
    const pre = statusesOf(buildGcpStages(snapshot({ verificationState: "awaiting_dns", status: "pending" })));
    const post = statusesOf(buildGcpStages(snapshot({ verificationState: "awaiting_dns", status: "active" })));

    expect(pre).toEqual(post);
    // And no row has a `done` after a `pending`.
    for (const row of [pre, post]) {
      const firstPending = row.indexOf("pending");
      if (firstPending !== -1) {
        expect(row.slice(firstPending)).not.toContain("done");
      }
    }
  });

  it("handles a terminal state the same way", () => {
    const view = buildGcpStages(
      snapshot({ verificationState: "timed_out", verificationMessage: "google gave up" }),
    );

    expect(statusesOf(view)).toEqual(["done", "done", "failed"]);
    expect(view.resumable).toBe(true);
  });
});
