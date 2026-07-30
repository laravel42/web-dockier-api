import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getOpengrepRulesDir, resolveWorkspaceRoot } from "../utils/paths.js";

describe("paths", () => {
  it("resolves opengrep rules from backend cwd", () => {
    const root = resolveWorkspaceRoot();
    const rulesDir = getOpengrepRulesDir();
    expect(existsSync(join(root, "code-analysis", "rules", "opengrep"))).toBe(true);
    expect(rulesDir).toBe(join(root, "code-analysis", "rules", "opengrep"));
  });
});
