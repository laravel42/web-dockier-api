import { describe, expect, it } from "vitest";
import {
  getSiteFaviconUrl,
  isSuitableAvatarFaviconAspectRatio,
  isValidFaviconUrl,
} from "../utils/projectFavicon";

describe("isValidFaviconUrl", () => {
  it("rejects empty base64 data URLs", () => {
    expect(isValidFaviconUrl("data:image/x-icon;base64,")).toBe(false);
    expect(isValidFaviconUrl("data:image/png;base64,   ")).toBe(false);
  });

  it("accepts non-empty base64 payloads", () => {
    expect(isValidFaviconUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("accepts http(s) URLs", () => {
    expect(isValidFaviconUrl("https://example.com/favicon.ico")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidFaviconUrl("")).toBe(false);
    expect(isValidFaviconUrl(undefined)).toBe(false);
  });
});

describe("getSiteFaviconUrl", () => {
  it("returns the site's own favicon on its own origin", () => {
    expect(getSiteFaviconUrl("https://example.com")).toBe("https://example.com/favicon.ico");
  });

  it("assumes https for scheme-less input and preserves the port", () => {
    expect(getSiteFaviconUrl("example.com")).toBe("https://example.com/favicon.ico");
    expect(getSiteFaviconUrl("https://example.com:8443/some/path")).toBe(
      "https://example.com:8443/favicon.ico",
    );
  });

  it("never routes through a third-party favicon service", () => {
    const url = getSiteFaviconUrl("https://example.com") ?? "";
    expect(url).not.toMatch(/google\.com|duckduckgo\.com/);
  });

  it("returns undefined for unparseable input", () => {
    expect(getSiteFaviconUrl("")).toBeUndefined();
    expect(getSiteFaviconUrl("http://")).toBeUndefined();
  });
});

describe("isSuitableAvatarFaviconAspectRatio", () => {
  it("accepts square favicons", () => {
    expect(isSuitableAvatarFaviconAspectRatio(32, 32)).toBe(true);
    expect(isSuitableAvatarFaviconAspectRatio(64, 64)).toBe(true);
  });

  it("accepts slightly rectangular favicons within 0.8–1.25", () => {
    expect(isSuitableAvatarFaviconAspectRatio(40, 32)).toBe(true);
    expect(isSuitableAvatarFaviconAspectRatio(32, 40)).toBe(true);
  });

  it("rejects wide wordmarks like MAILDRILL (320x64)", () => {
    expect(isSuitableAvatarFaviconAspectRatio(320, 64)).toBe(false);
  });

  it("rejects invalid dimensions", () => {
    expect(isSuitableAvatarFaviconAspectRatio(0, 32)).toBe(false);
    expect(isSuitableAvatarFaviconAspectRatio(32, 0)).toBe(false);
  });
});
