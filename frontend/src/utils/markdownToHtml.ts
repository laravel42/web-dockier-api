/**
 * Lightweight markdown-to-HTML converter.
 * Handles headers, bold, italic, inline code, bullet lists, numbered lists, and links.
 */
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Close lists if we're no longer in one
    if (inUl && !line.match(/^[-*]\s/)) { out.push("</ul>"); inUl = false; }
    if (inOl && !line.match(/^\d+\.\s/)) { out.push("</ol>"); inOl = false; }

    // Headers
    if (line.startsWith("#### ")) {
      out.push(`<h4>${inline(line.slice(5))}</h4>`);
    } else if (line.startsWith("### ")) {
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    }
    // Unordered list
    else if (line.match(/^[-*]\s/)) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s/, ""))}</li>`);
    }
    // Ordered list
    else if (line.match(/^\d+\.\s/)) {
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`);
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      out.push("<hr />");
    }
    // Empty line
    else if (line.trim() === "") {
      out.push("");
    }
    // Paragraph
    else {
      out.push(`<p>${inline(line)}</p>`);
    }
  }

  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");

  return out.join("\n");
}

function inline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
