/**
 * Dockier-owned SSH key generation.
 *
 * Dokploy manages its OWN key for its OWN SSH access to a provisioned server.
 * To run commands (post-deploy scripts and on-demand commands from the Dockier
 * UI) inside the deployed container, Dockier needs independent SSH access — so
 * we generate a second keypair here, install its PUBLIC half on the VM at
 * provision time (alongside Dokploy's), and persist the PRIVATE half encrypted
 * on the server mapping. Dockier then SSHes in as root to `docker exec`.
 *
 * Key type: RSA-2048.
 *
 * We intentionally do NOT use ed25519 here, even though it's smaller/nicer:
 * OpenSSH's `ssh -i` only accepts ed25519 private keys in the native OpenSSH
 * private-key container (`-----BEGIN OPENSSH PRIVATE KEY-----`), and Node's
 * `crypto` cannot export that container — it only emits PKCS#8/SEC1/PKCS#1.
 * An ed25519 key exported as PKCS#8 PEM makes `ssh -i` fail with
 * `Load key "...": invalid format` → `Permission denied (publickey)`. RSA does
 * not have this problem: OpenSSH reads RSA private keys from the traditional
 * PKCS#1 PEM (`-----BEGIN RSA PRIVATE KEY-----`) that Node can export directly,
 * so command execution works without any hand-rolled key container.
 */

import { generateKeyPairSync, createPublicKey } from "node:crypto";

export interface DockierSshKeyPair {
  /**
   * RSA private key as traditional PKCS#1 PEM (`-----BEGIN RSA PRIVATE KEY-----`).
   * This is the format `ssh -i` reads directly — what we store (encrypted) and
   * write to a temp file for command execution.
   */
  privateKeyPem: string;
  /** OpenSSH authorized_keys line, e.g. "ssh-rsa AAAA... dockier". */
  publicKeyOpenssh: string;
}

/**
 * Generate an RSA-2048 keypair for Dockier's SSH access to a server.
 *
 * Returns the private key as PKCS#1 PEM (usable directly by `ssh -i`) and the
 * public key in OpenSSH single-line format (usable directly in authorized_keys).
 */
export function generateDockierSshKey(comment = "dockier"): DockierSshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  // PKCS#1 ("BEGIN RSA PRIVATE KEY") is the traditional OpenSSH-readable PEM.
  const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const publicKeyOpenssh = toOpensshRsaPublicKey(publicKey, comment);

  return { privateKeyPem, publicKeyOpenssh };
}

/**
 * Convert a Node RSA public KeyObject into an OpenSSH authorized_keys line.
 *
 * OpenSSH wire format for RSA:
 *   string  "ssh-rsa"
 *   mpint   e   (public exponent)
 *   mpint   n   (modulus)
 * where each `string`/`mpint` is a 4-byte big-endian length prefix followed by
 * the bytes. The concatenated blob is base64-encoded, prefixed with the key
 * type and suffixed with a comment.
 *
 * We read e/n from the key's JWK (base64url) rather than parsing DER, which
 * keeps the encoding straightforward and correct.
 */
function toOpensshRsaPublicKey(publicKey: ReturnType<typeof createPublicKey>, comment: string): string {
  const jwk = publicKey.export({ format: "jwk" }) as { e?: string; n?: string };
  if (!jwk.e || !jwk.n) {
    throw new Error("Failed to derive RSA public key components (e/n) for OpenSSH encoding");
  }

  const e = base64UrlToBuffer(jwk.e);
  const n = base64UrlToBuffer(jwk.n);

  const blob = Buffer.concat([
    lengthPrefixed(Buffer.from("ssh-rsa", "ascii")),
    lengthPrefixed(toMpint(e)),
    lengthPrefixed(toMpint(n)),
  ]);

  return `ssh-rsa ${blob.toString("base64")} ${comment}`;
}

/** Decode a base64url string (JWK encoding) into a Buffer. */
function base64UrlToBuffer(b64url: string): Buffer {
  return Buffer.from(b64url, "base64url");
}

/**
 * Normalize a big-endian integer to the SSH `mpint` representation: strip
 * leading zero bytes, then prepend a single 0x00 if the high bit of the first
 * byte is set (so the value is never interpreted as negative).
 */
function toMpint(buf: Buffer): Buffer {
  let start = 0;
  while (start < buf.length - 1 && buf[start] === 0x00) start++;
  const trimmed = buf.subarray(start);
  if (trimmed.length > 0 && (trimmed[0] & 0x80) !== 0) {
    return Buffer.concat([Buffer.from([0x00]), trimmed]);
  }
  return Buffer.from(trimmed);
}

/** Prefix a buffer with its 4-byte big-endian length (SSH wire "string"). */
function lengthPrefixed(buf: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}
