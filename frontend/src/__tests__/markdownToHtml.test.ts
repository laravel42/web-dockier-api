import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../utils/markdownToHtml";

describe("markdownToHtml", () => {
  it("converts h1 headers", () => {
    expect(markdownToHtml("# Hello")).toContain("<h1>Hello</h1>");
  });

  it("converts h2 headers", () => {
    expect(markdownToHtml("## Section")).toContain("<h2>Section</h2>");
  });

  it("converts h3 headers", () => {
    expect(markdownToHtml("### Sub")).toContain("<h3>Sub</h3>");
  });

  it("converts bold text", () => {
    expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
  });

  it("converts italic text", () => {
    expect(markdownToHtml("*italic*")).toContain("<em>italic</em>");
  });

  it("converts inline code", () => {
    const result = markdownToHtml("`code`");
    expect(result).toContain("<code>code</code>");
  });

  it("converts unordered lists", () => {
    const result = markdownToHtml("- item 1\n- item 2");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item 1</li>");
    expect(result).toContain("<li>item 2</li>");
    expect(result).toContain("</ul>");
  });

  it("converts ordered lists", () => {
    const result = markdownToHtml("1. first\n2. second");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>first</li>");
    expect(result).toContain("<li>second</li>");
    expect(result).toContain("</ol>");
  });

  it("converts links", () => {
    const result = markdownToHtml("[text](https://example.com)");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain(">text</a>");
  });

  it("converts horizontal rules", () => {
    expect(markdownToHtml("---")).toContain("<hr />");
  });

  it("wraps plain text in paragraphs", () => {
    expect(markdownToHtml("hello world")).toContain("<p>hello world</p>");
  });

  it("escapes HTML entities", () => {
    const result = markdownToHtml("<script>alert('xss')</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("handles empty input", () => {
    expect(markdownToHtml("")).toBe("");
  });

  it("handles mixed content", () => {
    const md = "## Title\n\nSome **bold** text with `code`.\n\n- item 1\n- item 2\n\nA [link](https://x.com).";
    const result = markdownToHtml(md);
    expect(result).toContain("<h2>Title</h2>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<code>code</code>");
    expect(result).toContain("<li>item 1</li>");
    expect(result).toContain('href="https://x.com"');
  });
});
