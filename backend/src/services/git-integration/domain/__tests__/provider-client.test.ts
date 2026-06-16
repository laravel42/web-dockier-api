import { describe, expect, it } from "vitest";
import { parseGitHubLinkNext } from "../provider-client.js";

describe("parseGitHubLinkNext", () => {
  it("returns the next page URL from a GitHub Link header", () => {
    const header =
      '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next", ' +
      '<https://api.github.com/user/repos?per_page=100&page=5>; rel="last"';
    expect(parseGitHubLinkNext(header)).toBe("https://api.github.com/user/repos?per_page=100&page=2");
  });

  it("returns null when there is no next link", () => {
    expect(parseGitHubLinkNext('<https://api.github.com/user/repos?per_page=100&page=1>; rel="last"')).toBeNull();
    expect(parseGitHubLinkNext(null)).toBeNull();
  });
});
