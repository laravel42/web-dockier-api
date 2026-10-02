/**
 * Caught-Value Message Extractors — Unit Tests
 *
 * `getErrMsg` is used in every `catch (e: unknown)` block; `getErrDetail`
 * additionally unwraps one level of `cause` so PostgREST failures stay
 * diagnosable in deploy logs.
 *
 * Regression covered here: `getErrMsg` now unwraps a `message` field from a
 * non-Error object, which it used to render as "[object Object]". That also
 * improves `getErrDetail`'s base message for the same inputs.
 */

import { describe, it, expect } from "vitest";
import { getErrMsg, getErrDetail } from "../error-message.js";

describe("getErrMsg", () => {
  it("returns an Error's message", () => {
    expect(getErrMsg(new Error("boom"))).toBe("boom");
  });

  it("returns a subclass Error's message", () => {
    class CustomError extends Error {}
    expect(getErrMsg(new CustomError("custom boom"))).toBe("custom boom");
  });

  it("returns an empty string for an Error with no message", () => {
    expect(getErrMsg(new Error())).toBe("");
  });

  it("returns a string value as-is", () => {
    expect(getErrMsg("plain failure")).toBe("plain failure");
  });

  it("stringifies a number", () => {
    expect(getErrMsg(42)).toBe("42");
  });

  it("stringifies null and undefined", () => {
    expect(getErrMsg(null)).toBe("null");
    expect(getErrMsg(undefined)).toBe("undefined");
  });

  it("stringifies a plain object to [object Object]", () => {
    expect(getErrMsg({})).toBe("[object Object]");
  });

  // Regression: a non-Error object carrying a `message` field (the shape
  // PostgREST and several SDKs reject with) used to stringify to
  // "[object Object]", losing the only useful text.
  it("unwraps a message field from a plain object", () => {
    expect(getErrMsg({ message: "duplicate key" })).toBe("duplicate key");
  });

  it("unwraps the message from a full PostgREST-shaped object", () => {
    expect(getErrMsg({ message: "permission denied", details: null, hint: null, code: "42501" })).toBe(
      "permission denied",
    );
  });

  it("ignores a non-string message", () => {
    expect(getErrMsg({ message: 42 })).toBe("[object Object]");
    expect(getErrMsg({ message: null })).toBe("[object Object]");
    expect(getErrMsg({ message: { nested: "no" } })).toBe("[object Object]");
  });

  it("ignores an empty-string message", () => {
    expect(getErrMsg({ message: "" })).toBe("[object Object]");
  });

  it("stringifies an array", () => {
    expect(getErrMsg(["a", "b"])).toBe("a,b");
  });
});

describe("getErrDetail — no cause", () => {
  it("falls back to the base message for an Error with no cause", () => {
    expect(getErrDetail(new Error("boom"))).toBe("boom");
  });

  it("falls back to the base message for a string", () => {
    expect(getErrDetail("plain failure")).toBe("plain failure");
  });

  it("handles null and undefined without throwing", () => {
    expect(getErrDetail(null)).toBe("null");
    expect(getErrDetail(undefined)).toBe("undefined");
  });

  it("ignores a falsy cause", () => {
    const err = new Error("boom", { cause: "" });
    expect(getErrDetail(err)).toBe("boom");
    // Base message comes from getErrMsg, which now unwraps a plain object's
    // `message` instead of rendering it as "[object Object]".
    expect(getErrDetail({ message: "x", cause: 0 })).toBe("x");
  });
});

describe("getErrDetail — Error cause", () => {
  it("appends the cause's message in parentheses", () => {
    const err = new Error("Failed to upsert project", { cause: new Error("connection reset") });
    expect(getErrDetail(err)).toBe("Failed to upsert project (connection reset)");
  });

  it("returns only the base message when the cause repeats it", () => {
    const err = new Error("same", { cause: new Error("same") });
    expect(getErrDetail(err)).toBe("same");
  });

  it("unwraps a single level only — a nested cause is not included", () => {
    const inner = new Error("inner");
    const middle = new Error("middle", { cause: inner });
    const outer = new Error("outer", { cause: middle });
    expect(getErrDetail(outer)).toBe("outer (middle)");
  });
});

describe("getErrDetail — PostgREST-shaped cause", () => {
  it("labels and joins message, details, hint and code in that order", () => {
    const err = new Error("Failed to insert row", {
      cause: {
        message: "duplicate key value violates unique constraint",
        details: "Key (name)=(acme) already exists.",
        hint: "Use a different name",
        code: "23505",
      },
    });
    expect(getErrDetail(err)).toBe(
      "Failed to insert row (message: duplicate key value violates unique constraint | " +
        "details: Key (name)=(acme) already exists. | hint: Use a different name | code: 23505)",
    );
  });

  it("includes only the fields present", () => {
    const err = new Error("Query failed", { cause: { message: "permission denied", code: "42501" } });
    expect(getErrDetail(err)).toBe("Query failed (message: permission denied | code: 42501)");
  });

  it("skips empty-string and non-string fields", () => {
    const err = new Error("Query failed", { cause: { message: "", details: 42, hint: "try again" } });
    expect(getErrDetail(err)).toBe("Query failed (hint: try again)");
  });

  it("falls back to JSON for an object with none of the known fields", () => {
    const err = new Error("Query failed", { cause: { status: 500 } });
    expect(getErrDetail(err)).toBe('Query failed ({"status":500})');
  });
});

describe("getErrDetail — primitive cause", () => {
  it("appends a string cause", () => {
    expect(getErrDetail(new Error("outer", { cause: "why" }))).toBe("outer (why)");
  });

  it("appends a number cause", () => {
    expect(getErrDetail(new Error("outer", { cause: 500 }))).toBe("outer (500)");
  });

  it("reads cause from a non-Error object too", () => {
    expect(getErrDetail({ message: "outer reason", cause: "root reason" })).toBe("outer reason (root reason)");
  });
});
