/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadJson } from "./downloadJson";
import type { LogEntry } from "@observability/types";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "test-id-1",
    timestamp: 1700000000000,
    type: "info",
    source: "proxy",
    group: "default",
    message: "test message",
    ...overrides,
  };
}

describe("downloadJson", () => {
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn();

    // Mock URL APIs
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    globalThis.URL.revokeObjectURL = vi.fn();

    // Mock anchor element creation
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      style: { display: "" },
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a blob with JSON content and triggers download", () => {
    const entries = [makeEntry()];
    downloadJson(entries);

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledOnce();
    const blob = (globalThis.URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("uses default filename with timestamp when none provided", () => {
    downloadJson([makeEntry()]);

    const anchor = (document.createElement as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(anchor.download).toMatch(/^logs-\d+\.json$/);
  });

  it("uses custom filename when provided", () => {
    downloadJson([makeEntry()], "my-export.json");

    const anchor = (document.createElement as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(anchor.download).toBe("my-export.json");
  });

  it("handles empty entries array", () => {
    downloadJson([]);

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
  });
});
