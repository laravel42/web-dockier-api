import { describe, expect, it } from "vitest";
import { pageSlicesForSeverityOrder } from "../finding-order.js";

describe("pageSlicesForSeverityOrder", () => {
  it("fills the first page with errors then warnings before infos", () => {
    expect(pageSlicesForSeverityOrder(0, 40, { error: 2, warning: 10, info: 100 })).toEqual([
      { severity: "error", offset: 0, limit: 2 },
      { severity: "warning", offset: 0, limit: 10 },
      { severity: "info", offset: 0, limit: 28 },
    ]);
  });

  it("skips infos until errors and warnings are exhausted", () => {
    expect(pageSlicesForSeverityOrder(0, 40, { error: 2, warning: 50, info: 100 })).toEqual([
      { severity: "error", offset: 0, limit: 2 },
      { severity: "warning", offset: 0, limit: 38 },
    ]);
  });

  it("starts in infos after paging past errors and warnings", () => {
    expect(pageSlicesForSeverityOrder(15, 10, { error: 5, warning: 10, info: 20 })).toEqual([
      { severity: "info", offset: 0, limit: 10 },
    ]);
  });
});
