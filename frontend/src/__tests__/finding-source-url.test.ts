import { describe, expect, it } from "vitest";
import { findingSourceUrl } from "../pages/ScanDetail/utils/scanPaths";

/**
 * The "Source" link in MR and issue bodies used GitLab's /-/blame/ path for every
 * host, a 404 on GitHub and Bitbucket, and the raw path (legacy absolute clone
 * paths, unencoded characters) besides.
 */
describe("findingSourceUrl", () => {
  it("uses each host's own blame path", () => {
    expect(findingSourceUrl("https://github.com/acme/app.git", "main", "src/a.ts", 12))
      .toBe("https://github.com/acme/app/blame/main/src/a.ts#L12");
    expect(findingSourceUrl("https://gitlab.com/acme/app", "main", "src/a.ts", 12))
      .toBe("https://gitlab.com/acme/app/-/blame/main/src/a.ts#L12");
    expect(findingSourceUrl("https://bitbucket.org/acme/app", "main", "src/a.ts", 12))
      .toBe("https://bitbucket.org/acme/app/src/main/src/a.ts#lines-12");
  });

  it("treats an unknown host as self-hosted GitLab", () => {
    expect(findingSourceUrl("https://git.laravel42.com/web/app", "main", "a.php", 3))
      .toBe("https://git.laravel42.com/web/app/-/blame/main/a.php#L3");
  });

  it("strips a legacy clone prefix and encodes the path and branch per segment", () => {
    expect(findingSourceUrl("https://github.com/acme/app", "feature/x", "/tmp/build-1/repo/docs/a b#1.md", 1))
      .toBe("https://github.com/acme/app/blame/feature/x/docs/a%20b%231.md#L1");
  });
});
