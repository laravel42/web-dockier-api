import { describe, expect, it } from "vitest";
import { dnsBannerCopy } from "@/utils/dnsBannerCopy";

describe("dnsBannerCopy", () => {
  it("warns about a new server address after teardown", () => {
    const copy = dnsBannerCopy("torn_down", true);
    expect(copy.show).toBe(true);
    expect(copy.text).toContain("torn down");
    expect(copy.text).toContain("new server address");
  });

  it("frames the first-ever deploy for a never-deployed project", () => {
    const copy = dnsBannerCopy("none", true);
    expect(copy.show).toBe(true);
    expect(copy.text).toContain("first time you deploy");
  });

  it("gives a low-key reminder when live", () => {
    const copy = dnsBannerCopy("live", true);
    expect(copy.show).toBe(true);
    expect(copy.text).toContain("still points");
  });

  it("stays hidden when there are no domains", () => {
    expect(dnsBannerCopy("torn_down", false)).toEqual({ show: false, text: "" });
    expect(dnsBannerCopy("live", false)).toEqual({ show: false, text: "" });
  });

  it("stays hidden when the infra state is unknown", () => {
    expect(dnsBannerCopy(undefined, true)).toEqual({ show: false, text: "" });
  });
});
