import { describe, expect, it } from "vitest";
import { createPublicKey, createPrivateKey } from "node:crypto";
import { generateDockierSshKey } from "../provisioning/ssh-keygen.js";

describe("generateDockierSshKey", () => {
  it("produces a usable PKCS#8 private key PEM", () => {
    const { privateKeyPem } = generateDockierSshKey();
    expect(privateKeyPem).toContain("BEGIN PRIVATE KEY");
    // Must be parseable by node:crypto (i.e. a real key, usable by ssh -i).
    expect(() => createPrivateKey(privateKeyPem)).not.toThrow();
  });

  it("produces a well-formed OpenSSH ed25519 public key line", () => {
    const { publicKeyOpenssh } = generateDockierSshKey("dockier-abc123");
    const parts = publicKeyOpenssh.split(" ");
    expect(parts[0]).toBe("ssh-ed25519");
    expect(parts[2]).toBe("dockier-abc123"); // comment
    // The base64 blob must decode and start with the ssh-ed25519 type string.
    const blob = Buffer.from(parts[1], "base64");
    const typeLen = blob.readUInt32BE(0);
    expect(blob.subarray(4, 4 + typeLen).toString("ascii")).toBe("ssh-ed25519");
  });

  it("public and private halves belong to the same key", () => {
    const { privateKeyPem, publicKeyOpenssh } = generateDockierSshKey();
    // Derive the raw public key from the private key and compare to the raw
    // bytes embedded in the OpenSSH line — they must match.
    const derivedRaw = createPublicKey(privateKeyPem)
      .export({ type: "spki", format: "der" })
      .subarray(-32);

    const blob = Buffer.from(publicKeyOpenssh.split(" ")[1], "base64");
    // skip "ssh-ed25519" string, then read the 32-byte key
    const typeLen = blob.readUInt32BE(0);
    const keyOffset = 4 + typeLen + 4;
    const embeddedRaw = blob.subarray(keyOffset, keyOffset + 32);

    expect(embeddedRaw.equals(derivedRaw)).toBe(true);
  });

  it("generates a distinct key each call", () => {
    const a = generateDockierSshKey();
    const b = generateDockierSshKey();
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
    expect(a.publicKeyOpenssh).not.toBe(b.publicKeyOpenssh);
  });
});
