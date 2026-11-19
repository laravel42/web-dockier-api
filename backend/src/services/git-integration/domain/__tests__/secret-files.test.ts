import { describe, expect, it } from "vitest";
import { isSecretFilePath } from "../ai/secret-files.js";
import { urlFilePath, urlSeg } from "../providers/provider-client.js";

describe("isSecretFilePath", () => {
  it.each([".env", "apps/api/.env.production", "id_rsa", "certs/server.pem", "config/secrets.yml", "credentials.json", ".npmrc", "infra/prod.tfvars", "gcp-service-account.json", ".aws/credentials", "auth.json", "src/auth.json"])(
    "refuses %s", (p) => expect(isSecretFilePath(p)).toBe(true),
  );
  it.each([".env.example", "src/auth/credentials.ts", "src/secrets.ts", "package.json", "keys.ts", "README.md", "config/secrets.yml.sample", "auth.json.example", "src/auth.ts"])(
    "allows %s", (p) => expect(isSecretFilePath(p)).toBe(false),
  );
});

describe("provider URL segments", () => {
  it("encodes a segment and refuses dot segments", () => {
    expect(urlSeg("my repo")).toBe("my%20repo");
    expect(urlSeg("a/b")).toBe("a%2Fb");
    expect(() => urlSeg("..")).toThrow();
    expect(() => urlSeg("")).toThrow();
  });
  it("keeps a file path's slashes but refuses traversal", () => {
    expect(urlFilePath("src/a b#1.ts")).toBe("src/a%20b%231.ts");
    expect(() => urlFilePath("../../../user")).toThrow();
    expect(() => urlFilePath("src/../../x")).toThrow();
  });
});
