import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { getOpengrepRulesDir } from "../../../shared/paths.js";
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

function parseRuleFileMeta(content: string): { severity: "error" | "warning" | "info"; message: string } {
  const severityMatch = content.match(/^\s+severity:\s+(\S+)/m);
  let message = "";
  const foldedMessage = content.match(/^\s+message:\s*>-?\s*\n((?:\s+.+\n?)+)/m);
  if (foldedMessage) {
    message = foldedMessage[1].replace(/^\s+/gm, " ").trim();
  } else {
    const inlineMessage = content.match(/^\s+message:\s*(.+)$/m);
    message = inlineMessage?.[1]?.trim() ?? "";
  }

  return {
    severity: mapSemgrepSeverity(severityMatch?.[1]),
    message,
  };
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
        const content = readFileSync(join(dir, entry.name), "utf-8");
        const meta = parseRuleFileMeta(content);
        rules.push({
          id: rel.replace(/\.yaml$/, "").replace(/\//g, "."),
          name: entry.name.replace(/\.yaml$/, "").replace(/-/g, " "),
          lang,
          path: rel,
          severity: meta.severity,
          category: rel.split("/")[1] ?? "general",
          message: meta.message,
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
