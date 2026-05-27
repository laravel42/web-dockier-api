import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { CodeAnalysisError } from "./scans.js";

const RULES_DIR = join(process.cwd(), "code-analysis", "rules", "opengrep");

export interface SemgrepRule {
  id: string;
  name: string;
  lang: string;
  path: string;
  severity: string;
  category: string;
  message: string;
}

/**
 * Walk the local semgrep rules directory and return metadata for each .yaml file.
 */
export function listSemgrepRules(): { rules: SemgrepRule[]; languages: string[] } {
  if (!existsSync(RULES_DIR)) return { rules: [], languages: [] };

  const rules: SemgrepRule[] = [];
  const walk = (dir: string, base: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !entry.name.startsWith(".")) walk(join(dir, entry.name), rel);
      if (entry.isFile() && entry.name.endsWith(".yaml") && !entry.name.startsWith(".")) {
        const lang = rel.split("/")[0];
        rules.push({
          id: rel.replace(/\.yaml$/, "").replace(/\//g, "."),
          name: entry.name.replace(/\.yaml$/, "").replace(/-/g, " "),
          lang,
          path: rel,
          severity: "info",
          category: rel.split("/")[1] ?? "general",
          message: "",
        });
      }
    }
  };
  walk(RULES_DIR, "");

  const languages = [...new Set(rules.map((rule) => rule.lang))].sort();
  return { rules, languages };
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

/**
 * Update the content of a semgrep rule file. Validates path stays within RULES_DIR.
 */
export function updateSemgrepRuleContent(relativePath: string, content: string): void {
  const filePath = join(RULES_DIR, relativePath);
  const rel = relative(RULES_DIR, filePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new CodeAnalysisError("Invalid path", "bad_request");
  }
  writeFileSync(filePath, content, "utf-8");
}
