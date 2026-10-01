/**
 * Naming Utilities — Unit Tests
 *
 * These functions are the single source of truth for the identifiers used by
 * the deploy pipeline, command execution, network rules, and image builds: a
 * container deployed under one name must be addressable under the same name
 * everywhere. The assertions below therefore pin the EXACT current output,
 * including the odd edge cases, so a silent change in normalization is caught.
 */

import { describe, it, expect } from "vitest";
import {
  deriveRepoName,
  normalizeAppName,
  deriveAppName,
  containerNameFor,
  deriveContainerName,
  stackNameFor,
  sanitizeEcrRepoName,
} from "../naming.js";

// ─── deriveRepoName ────────────────────────────────────────────────

describe("deriveRepoName", () => {
  it.each([
    ["acme/my-app.io", "my-app-io"],
    ["user/SomeRepo", "somerepo"],
    ["org/my..app", "my-app"],
    ["org/.hidden", "hidden"],
    ["my-app", "my-app"],
    ["group/subgroup/my-app", "my-app"],
    ["org/My_App", "my-app"],
    ["org/app.v2", "app-v2"],
    ["org/  spaced  ", "spaced"],
    ["org/app@2x", "app-2x"],
  ])("derives %j → %j", (repo, expected) => {
    expect(deriveRepoName(repo)).toBe(expected);
  });

  it("falls back to 'app' for an empty string", () => {
    expect(deriveRepoName("")).toBe("app");
  });

  it("falls back to 'app' for a trailing slash (empty segment)", () => {
    expect(deriveRepoName("acme/")).toBe("app");
  });

  it("falls back to 'app' when every character is stripped", () => {
    expect(deriveRepoName("org/___")).toBe("app");
    expect(deriveRepoName("org/###")).toBe("app");
  });

  it("applies no length cap — over-long names pass through", () => {
    const long = "a".repeat(80);
    expect(deriveRepoName(`org/${long}`)).toBe(long);
  });

  it("is idempotent on already-normalized names", () => {
    expect(deriveRepoName(deriveRepoName("acme/My_App.io"))).toBe("my-app-io");
  });
});

// ─── normalizeAppName ──────────────────────────────────────────────

describe("normalizeAppName", () => {
  it.each([
    ["my--app.io", "my-app-io"],
    ["-leading-", "leading"],
    ["My_App", "my-app"],
    ["already-fine", "already-fine"],
    ["a.b.c", "a-b-c"],
    ["app 2", "app-2"],
    ["UPPER", "upper"],
  ])("normalizes %j → %j", (input, expected) => {
    expect(normalizeAppName(input)).toBe(expected);
  });

  it("falls back to 'app' for an empty string", () => {
    expect(normalizeAppName("")).toBe("app");
  });

  it("falls back to 'app' when every character is stripped", () => {
    expect(normalizeAppName("###")).toBe("app");
    expect(normalizeAppName("___")).toBe("app");
  });

  it("does not split a slash-separated path — slashes become hyphens", () => {
    expect(normalizeAppName("acme/my-app")).toBe("acme-my-app");
  });

  it("applies no length cap", () => {
    const long = "a".repeat(80);
    expect(normalizeAppName(long)).toBe(long);
  });
});

// ─── deriveAppName ─────────────────────────────────────────────────

describe("deriveAppName", () => {
  it.each([
    ["acme/my--app.io", "my-app-io"],
    ["acme/My_App", "my-app"],
    ["group/subgroup/My..App", "my-app"],
    ["plain", "plain"],
  ])("derives %j → %j", (repo, expected) => {
    expect(deriveAppName(repo)).toBe(expected);
  });

  it("falls back to 'app' for an empty string", () => {
    expect(deriveAppName("")).toBe("app");
  });

  it("falls back to 'app' for a trailing slash", () => {
    expect(deriveAppName("acme/")).toBe("app");
  });

  it("agrees with deriveRepoName on already-collapsed names", () => {
    expect(deriveAppName("acme/my-app.io")).toBe(deriveRepoName("acme/my-app.io"));
  });
});

// ─── containerNameFor ──────────────────────────────────────────────

describe("containerNameFor", () => {
  it("returns the repo name unchanged for aws", () => {
    expect(containerNameFor("my-app", "aws")).toBe("my-app");
  });

  it("returns even an unnormalized name unchanged for aws", () => {
    expect(containerNameFor("My_App", "aws")).toBe("My_App");
  });

  it("lowercases and hyphenates for non-aws providers", () => {
    expect(containerNameFor("My_App", "gcp")).toBe("my-app");
    expect(containerNameFor("My.App", "hetzner")).toBe("my-app");
  });

  it("does NOT collapse consecutive hyphens for non-aws providers", () => {
    expect(containerNameFor("My__App", "gcp")).toBe("my--app");
  });

  it("does NOT trim leading or trailing hyphens for non-aws providers", () => {
    expect(containerNameFor("_app_", "gcp")).toBe("-app-");
  });

  it("returns an empty string for empty input", () => {
    expect(containerNameFor("", "aws")).toBe("");
    expect(containerNameFor("", "gcp")).toBe("");
  });
});

// ─── deriveContainerName ───────────────────────────────────────────

describe("deriveContainerName", () => {
  it("derives from the repo path for aws", () => {
    expect(deriveContainerName("acme/My_App", "aws")).toBe("my-app");
  });

  it("derives from the repo path for a non-aws provider", () => {
    expect(deriveContainerName("acme/My_App", "gcp")).toBe("my-app");
  });

  it("uses the bare derived repo name when no provider is given", () => {
    expect(deriveContainerName("acme/My_App")).toBe("my-app");
  });

  it("returns null when the name would exceed the 63-character limit", () => {
    expect(deriveContainerName(`acme/${"a".repeat(64)}`)).toBeNull();
  });

  it("accepts a name exactly at the 63-character limit", () => {
    const boundary = "a".repeat(63);
    expect(deriveContainerName(`acme/${boundary}`)).toBe(boundary);
  });

  it("never returns null for empty input — deriveRepoName already falls back to 'app'", () => {
    expect(deriveContainerName("")).toBe("app");
    expect(deriveContainerName("org/___", "aws")).toBe("app");
  });
});

// ─── stackNameFor ──────────────────────────────────────────────────

describe("stackNameFor", () => {
  it("prefixes the sanitized app name", () => {
    expect(stackNameFor("my-app")).toBe("image-builder-app-my-app");
  });

  it("sanitizes the app name before prefixing", () => {
    expect(stackNameFor("My_App.io")).toBe("image-builder-app-my-app-io");
    expect(stackNameFor("ACME/Repo")).toBe("image-builder-app-acme-repo");
  });

  it("inherits sanitizeEcrRepoName's lack of hyphen collapsing", () => {
    expect(stackNameFor("my__app")).toBe("image-builder-app-my--app");
  });

  it("yields the bare prefix for an empty app name", () => {
    expect(stackNameFor("")).toBe("image-builder-app-");
  });
});

// ─── sanitizeEcrRepoName ───────────────────────────────────────────

describe("sanitizeEcrRepoName", () => {
  it.each([
    ["My_App.io", "my-app-io"],
    ["ACME/Repo", "acme-repo"],
    ["already-safe", "already-safe"],
    ["app 2", "app-2"],
    ["app@2x", "app-2x"],
  ])("sanitizes %j → %j", (input, expected) => {
    expect(sanitizeEcrRepoName(input)).toBe(expected);
  });

  it("does NOT collapse consecutive hyphens", () => {
    expect(sanitizeEcrRepoName("my__app")).toBe("my--app");
    expect(sanitizeEcrRepoName("my..app")).toBe("my--app");
  });

  it("does NOT trim leading or trailing hyphens, and has no 'app' fallback", () => {
    expect(sanitizeEcrRepoName("_app_")).toBe("-app-");
    expect(sanitizeEcrRepoName("")).toBe("");
    expect(sanitizeEcrRepoName("###")).toBe("---");
  });
});
