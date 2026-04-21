import { describe, it, expect } from "vitest";
import { BADGE_WHITELIST } from "../data/badgeWhitelist";

describe("BADGE_WHITELIST", () => {
  it("is a Set", () => {
    expect(BADGE_WHITELIST).toBeInstanceOf(Set);
  });

  it("contains major frameworks", () => {
    expect(BADGE_WHITELIST.has("Laravel")).toBe(true);
    expect(BADGE_WHITELIST.has("Next.js")).toBe(true);
    expect(BADGE_WHITELIST.has("Django")).toBe(true);
    expect(BADGE_WHITELIST.has("Rails")).toBe(true);
    expect(BADGE_WHITELIST.has("React")).toBe(true);
    expect(BADGE_WHITELIST.has("Vue")).toBe(true);
  });

  it("contains CSS frameworks", () => {
    expect(BADGE_WHITELIST.has("Tailwind CSS")).toBe(true);
    expect(BADGE_WHITELIST.has("Bootstrap")).toBe(true);
  });

  it("does NOT contain languages", () => {
    expect(BADGE_WHITELIST.has("TypeScript")).toBe(false);
    expect(BADGE_WHITELIST.has("JavaScript")).toBe(false);
    expect(BADGE_WHITELIST.has("PHP")).toBe(false);
    expect(BADGE_WHITELIST.has("Python")).toBe(false);
    expect(BADGE_WHITELIST.has("Node.js")).toBe(false);
  });

  it("does NOT contain packages/tools", () => {
    expect(BADGE_WHITELIST.has("ESLint")).toBe(false);
    expect(BADGE_WHITELIST.has("Prettier")).toBe(false);
    expect(BADGE_WHITELIST.has("Docker")).toBe(false);
    expect(BADGE_WHITELIST.has("Webpack")).toBe(false);
  });

  it("has no empty strings", () => {
    for (const entry of BADGE_WHITELIST) {
      expect(entry.trim().length).toBeGreaterThan(0);
    }
  });
});
