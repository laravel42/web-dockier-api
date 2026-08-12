import { describe, expect, it } from "vitest";
import { hasDevIcon } from "../data/devicons";
import { resolveTechBadgeIcon, techBadgeHasIcon } from "../utils/techBadgeIcon";

describe("hasDevIcon", () => {
  it("accepts slugs that have a file on disk", () => {
    expect(hasDevIcon("react")).toBe(true);
    expect(hasDevIcon("typescript")).toBe(true);
    expect(hasDevIcon("docker")).toBe(true);
  });

  it("accepts a slug that only ships themed variants", () => {
    // astro exists as astro-dark.svg / astro-light.svg, never as astro.svg.
    expect(hasDevIcon("astro")).toBe(true);
    expect(hasDevIcon("astro-dark")).toBe(true);
  });

  it("resolves aliases before checking", () => {
    expect(hasDevIcon("nodedotjs")).toBe(true);
    expect(hasDevIcon("rubyonrails")).toBe(true);
  });

  it("rejects slugs with no icon", () => {
    expect(hasDevIcon("mdx")).toBe(false);
    expect(hasDevIcon("handlebars")).toBe(false);
    expect(hasDevIcon("batchfile")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(hasDevIcon("")).toBe(false);
    expect(hasDevIcon("   ")).toBe(false);
  });
});

describe("resolveTechBadgeIcon", () => {
  it("maps display names to their devicon slug", () => {
    expect(resolveTechBadgeIcon("Shell")).toBe("bash");
    expect(resolveTechBadgeIcon("C#")).toBe("csharp");
    expect(resolveTechBadgeIcon("Tailwind CSS")).toBe("tailwind_css");
  });

  it("lowercases unmapped names and honours an explicit override", () => {
    expect(resolveTechBadgeIcon("Elixir")).toBe("elixir");
    expect(resolveTechBadgeIcon("Anything", "react")).toBe("react");
  });
});

describe("techBadgeHasIcon", () => {
  it("keeps stacks that render with an icon", () => {
    expect(techBadgeHasIcon("TypeScript")).toBe(true);
    expect(techBadgeHasIcon("Shell")).toBe(true);
    expect(techBadgeHasIcon("HTML")).toBe(true);
  });

  it("drops stacks that would render an empty chip", () => {
    expect(techBadgeHasIcon("MDX")).toBe(false);
    expect(techBadgeHasIcon("Batchfile")).toBe(false);
  });
});
