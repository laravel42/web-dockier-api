/**
 * Service Names Constant — Sanity Tests
 *
 * Ensures the shared SERVICE_NAMES constant stays consistent
 * and contains the expected entries.
 */

import { describe, it, expect } from "vitest";
import { SERVICE_NAMES, type ServiceName } from "../constants/services.js";

describe("SERVICE_NAMES", () => {
  it("includes gateway as the first entry", () => {
    expect(SERVICE_NAMES[0]).toBe("gateway");
  });

  it("contains all expected core services", () => {
    const expected = [
      "gateway",
      "auth",
      "users",
      "projects",
      "roles",
      "deploy",
      "commands",
      "processes",
      "network",
      "domains",
      "observe",
      "notifications",
      "integrations",
      "code-analysis",
      "git-integration",
      "image-builder",
    ];
    expect(SERVICE_NAMES).toEqual(expected);
  });

  it("has no duplicates", () => {
    const unique = new Set(SERVICE_NAMES);
    expect(unique.size).toBe(SERVICE_NAMES.length);
  });

  it("type-checks individual entries as ServiceName", () => {
    // This is mostly a compile-time check — if it compiles, it passes
    const name: ServiceName = SERVICE_NAMES[0];
    expect(name).toBe("gateway");
  });

  it("has at least 10 services (safety net against accidental truncation)", () => {
    expect(SERVICE_NAMES.length).toBeGreaterThanOrEqual(10);
  });
});
