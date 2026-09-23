import { describe, expect, it } from "vitest";
import { createPublicKey, createPrivateKey } from "node:crypto";
import { generateDockierSshKey } from "../provisioning/ssh-keygen.js";

describe("generateDockierSshKey", () => {
  it("produces an RSA PKCS#1 private key PEM that ssh -i can read", () => {
    const { privateKeyPem } = generateDockierSshKey();
    // Traditional PKCS#1 PEM — the format OpenSSH `ssh -i` reads natively.
    // (An ed25519 PKCS#8 PEM here would make ssh fail with "invalid format".)
    expect(privateKeyPem).toContain("BEGIN RSA PRIVATE KEY");
    // Must be parseable by node:crypto (i.e. a real, usable key).
    expect(() => createPrivateKey(privateKeyPem)).not.toThrow();
  });

  it("produces a well-formed OpenSSH ssh-rsa public key line", () => {
    const { publicKeyOpenssh } = generateDockierSshKey("dockier-abc123");
    const parts = publicKeyOpenssh.split(" ");
    expect(parts[0]).toBe("ssh-rsa");
    expect(parts[2]).toBe("dockier-abc123"); // comment

    // The base64 blob must decode to the ssh-rsa wire structure:
    //   string "ssh-rsa", mpint e, mpint n
    const blob = Buffer.from(parts[1], "base64");
    let off = 0;
    const readString = (): Buffer => {
      const len = blob.readUInt32BE(off);
      off += 4;
      const out = blob.subarray(off, off + len);
      off += len;
      return out;
    };
    expect(readString().toString("ascii")).toBe("ssh-rsa");
    const e = readString();
    const n = readString();
    expect(e.length).toBeGreaterThan(0);
    // 2048-bit modulus ≈ 256 bytes (257 with the mpint sign-guard 0x00).
    expect(n.length).toBeGreaterThanOrEqual(256);
    // We consumed the whole blob.
    expect(off).toBe(blob.length);
  });

  it("public and private halves belong to the same key", () => {
    const { privateKeyPem, publicKeyOpenssh } = generateDockierSshKey();
    // Derive the public key's OpenSSH line from the private key by regenerating
    // the same wire encoding, and compare the base64 blobs.
    const pub = createPublicKey(privateKeyPem);
    const jwk = pub.export({ format: "jwk" }) as { e: string; n: string };

    const blob = Buffer.from(publicKeyOpenssh.split(" ")[1], "base64");
    // Re-read e/n from the emitted blob and compare against the private key's JWK.
    let off = 0;
    const readString = (): Buffer => {
      const len = blob.readUInt32BE(off);
      off += 4;
      const out = blob.subarray(off, off + len);
      off += len;
      return out;
    };
    readString(); // "ssh-rsa"
    const eFromBlob = readString();
    const nFromBlob = readString();

    // Strip any mpint sign-guard 0x00 before comparing to the JWK bytes.
    const strip = (b: Buffer) => (b.length > 1 && b[0] === 0x00 ? b.subarray(1) : b);
    expect(strip(eFromBlob).equals(Buffer.from(jwk.e, "base64url"))).toBe(true);
    expect(strip(nFromBlob).equals(Buffer.from(jwk.n, "base64url"))).toBe(true);
  });

  it("generates a distinct key each call", () => {
    const a = generateDockierSshKey();
    const b = generateDockierSshKey();
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
    expect(a.publicKeyOpenssh).not.toBe(b.publicKeyOpenssh);
  });
});
