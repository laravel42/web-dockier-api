import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { parse as parseYaml } from "yaml";
import { getOpengrepRulesDir } from "../../../shared/utils/paths.js";
import { mapSemgrepSeverity } from "./scan-analysis.js";
import { CodeAnalysisError } from "./scans.js";

const RULES_DIR = getOpengrepRulesDir();

export interface SemgrepRule {
  id: string;
  name: string;
  lang: string;
  path: string;
  severity: string;
  category: string;
  message: string;
}

interface RuleYaml {
  rules?: Array<{ id?: unknown; severity?: unknown; message?: unknown }>;
}

let cached: { rules: SemgrepRule[]; languages: string[] } | null = null;

/**
 * One entry per rule in the corpus. `id` is what a scan reports and what a rule
 * override must match: the rule's directory plus the `id` inside the YAML, never
 * the file name (they differ in 172 files, and 9 files hold several rules).
 */
export function listSemgrepRules(): { rules: SemgrepRule[]; languages: string[] } {
  // The corpus ships in the image and only changes with a deploy.
  if (cached) return cached;
  if (!existsSync(RULES_DIR)) return { rules: [], languages: [] };

  const rules: SemgrepRule[] = [];
  const walk = (dir: string, base: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;

      let parsed: RuleYaml | null = null;
      try {
        parsed = parseYaml(readFileSync(join(dir, entry.name), "utf-8")) as RuleYaml | null;
      } catch {
        continue; // Semgrep rejects the same file, so it can never produce a finding.
      }
      const dirs = rel.split("/").slice(0, -1);
      for (const rule of parsed?.rules ?? []) {
        if (typeof rule.id !== "string" || !rule.id) continue;
        rules.push({
          id: [...dirs, rule.id].join("."),
          name: rule.id.replace(/[-_]/g, " "),
          lang: dirs[0] ?? "generic",
          path: rel,
          severity: mapSemgrepSeverity(typeof rule.severity === "string" ? rule.severity : undefined),
          category: dirs[1] ?? "general",
          message: typeof rule.message === "string" ? rule.message.replace(/\s+/g, " ").trim() : "",
        });
      }
    }
  };
  walk(RULES_DIR, "");

  rules.sort((a, b) => a.id.localeCompare(b.id));
  cached = { rules, languages: [...new Set(rules.map((rule) => rule.lang))].sort() };
  return cached;
}

/**
 * Read the content of a semgrep rule file. Validates path stays within RULES_DIR.
 */
export function getSemgrepRuleContent(relativePath: string): string {
  const filePath = join(RULES_DIR, relativePath);
  const rel = relative(RULES_DIR, filePath);
  if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(filePath)) {
    throw new CodeAnalysisError("Rule file not found", "not_found");
  }
  return readFileSync(filePath, "utf-8");
}

