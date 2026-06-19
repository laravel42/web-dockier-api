import type { PartialBlock } from "@blocknote/core";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove a leading markdown heading or bold title line from AI section text. */
export function stripLeadingHeading(content: string, headings: string[]): string {
  let text = content.trim();
  for (const heading of headings) {
    const escaped = escapeRegExp(heading);
    text = text.replace(new RegExp(`^#{1,6}\\s*${escaped}\\s*\\n+`, "i"), "");
    text = text.replace(new RegExp(`^\\*\\*${escaped}\\*\\*\\s*\\n+`, "i"), "");
    text = text.replace(new RegExp(`^${escaped}\\s*\\n+`, "i"), "");
  }
  return text.trim();
}

function blockPlainText(block: PartialBlock): string {
  const { content } = block;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function isHeading(block: PartialBlock, labels: string[]): boolean {
  if (block.type !== "heading") return false;
  const text = blockPlainText(block).trim().toLowerCase();
  return labels.some((label) => text === label.toLowerCase());
}

/** Drop a leading "Overview" heading block — the tab label already provides context. */
export function normalizeOverviewBlocks(blocks: PartialBlock[]): PartialBlock[] {
  let start = 0;
  while (start < blocks.length && isHeading(blocks[start], ["Overview", "Project Overview"])) {
    start += 1;
  }
  return blocks.slice(start);
}
