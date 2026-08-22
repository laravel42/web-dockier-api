import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-php";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-css";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";

export const CODE_PREVIEW_MAX_CHARS = 2000;
export const CODE_PREVIEW_CONTEXT_LINES = 2;

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  go: "go",
  java: "java",
  php: "php",
  rb: "ruby",
  rs: "rust",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  css: "css",
  scss: "scss",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  cs: "csharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mdx: "markdown",
};

export interface CodePreviewRow {
  lineNumber: number;
  text: string;
  html: string;
  /** True for the finding's line span; false for surrounding context lines. */
  highlighted: boolean;
}

export function languageFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? "";
  if (base.toLowerCase() === "dockerfile") return "docker";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";
  if (!ext) return "clike";
  return EXT_TO_LANG[ext] ?? "clike";
}

export function highlightCode(code: string, language: string): string {
  const grammar = Prism.languages[language] ?? Prism.languages.clike;
  const lang = Prism.languages[language] ? language : "clike";
  try {
    return Prism.highlight(code, grammar, lang);
  } catch {
    return Prism.util.encode(code);
  }
}

function slicePreviewLines(
  lines: string[],
  startLine: number,
  endLine: number,
  maxChars: number,
  contextLines: number = CODE_PREVIEW_CONTEXT_LINES,
): { lineNumber: number; text: string; highlighted: boolean }[] {
  const affectedStart = Math.max(0, startLine - 1);
  const affectedEnd = Math.min(lines.length, endLine);
  const sliceStart = Math.max(0, affectedStart - contextLines);
  const sliceEnd = Math.min(lines.length, affectedEnd + contextLines);
  const slice = lines.slice(sliceStart, sliceEnd);

  const rows: { lineNumber: number; text: string; highlighted: boolean }[] = [];
  let charCount = 0;

  for (let i = 0; i < slice.length; i++) {
    const line = slice[i] ?? "";
    const lineNumber = sliceStart + i + 1;
    const highlighted = lineNumber >= startLine && lineNumber <= endLine;
    const separator = rows.length > 0 ? 1 : 0;
    const remaining = maxChars - charCount - separator;

    if (remaining <= 0) break;

    if (line.length > remaining) {
      rows.push({ lineNumber, text: `${line.slice(0, remaining)}…`, highlighted });
      break;
    }

    charCount += separator + line.length;
    rows.push({ lineNumber, text: line || " ", highlighted });
  }

  return rows;
}

export function buildCodePreviewRows(
  filePath: string,
  lines: string[],
  startLine: number,
  endLine: number,
  maxChars: number = CODE_PREVIEW_MAX_CHARS,
): { rows: CodePreviewRow[]; truncated: boolean } {
  const language = languageFromPath(filePath);
  const affectedStart = Math.max(0, startLine - 1);
  const affectedEnd = Math.min(lines.length, endLine);
  const sliceStart = Math.max(0, affectedStart - CODE_PREVIEW_CONTEXT_LINES);
  const sliceEnd = Math.min(lines.length, affectedEnd + CODE_PREVIEW_CONTEXT_LINES);
  const expectedLineCount = sliceEnd - sliceStart;
  const source = slicePreviewLines(lines, startLine, endLine, maxChars);
  const truncated =
    source.length < expectedLineCount || source.some((row) => row.text.endsWith("…"));

  return {
    truncated,
    rows: source.map((row) => ({
      ...row,
      html: highlightCode(row.text, language),
    })),
  };
}

export function buildSnippetPreviewRow(
  filePath: string,
  snippet: string,
  startLine: number,
  maxChars: number = CODE_PREVIEW_MAX_CHARS,
): CodePreviewRow | null {
  const text = snippet.length > maxChars ? `${snippet.slice(0, maxChars)}…` : snippet;
  if (!text) return null;
  const language = languageFromPath(filePath);
  return {
    lineNumber: startLine,
    text,
    html: highlightCode(text, language),
    highlighted: true,
  };
}
