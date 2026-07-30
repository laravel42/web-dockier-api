import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Locate monorepo root by finding code-analysis rule assets. */
export function resolveWorkspaceRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "../.."),
  ];

  for (const root of candidates) {
    if (existsSync(join(root, "code-analysis", "rules", "opengrep"))) {
      return root;
    }
  }

  throw new Error(
    "Could not locate code-analysis rules (expected code-analysis/rules/opengrep under workspace root)",
  );
}

export function getOpengrepRulesDir(): string {
  return join(resolveWorkspaceRoot(), "code-analysis", "rules", "opengrep");
}
