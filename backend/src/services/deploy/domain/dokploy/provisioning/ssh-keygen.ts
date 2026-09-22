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
 * ed25519 is used: small keys, universally supported by modern OpenSSH, and
 * the OpenSSH public-key line format is trivial to emit for authorized_keys.
 */

import { generateKeyPairSync, createPublicKey } from "node:crypto";

export interface DockierSshKeyPair {
  /** PEM-encoded PKCS#8 private key (what we store, encrypted, and write to a temp file for `ssh -i`). */
  privateKeyPem: string;
  /** OpenSSH authorized_keys line, e.g. "ssh-ed25519 AAAA... dockier". */
  publicKeyOpenssh: string;
}

/**
 * Generate an ed25519 keypair for Dockier's SSH access to a server.
 *
 * Returns the private key as PKCS#8 PEM (usable directly by `ssh -i`) and the
 * public key in OpenSSH single-line format (usable directly in authorized_keys).
 */
export function generateDockierSshKey(comment = "dockier"): DockierSshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyOpenssh = toOpensshPublicKey(publicKey, comment);

  return { privateKeyPem, publicKeyOpenssh };
}

/**
 * Convert a Node ed25519 public KeyObject into an OpenSSH authorized_keys line.
 *
 * OpenSSH wire format for ed25519:
 *   string  "ssh-ed25519"
 *   string  <32-byte raw public key>
 * each `string` is a 4-byte big-endian length prefix followed by the bytes.
 * The blob is base64-encoded and prefixed with the key type + suffixed with a
 * comment.
 */
function toOpensshPublicKey(publicKey: ReturnType<typeof createPublicKey>, comment: string): string {
  // The 32-byte raw ed25519 public key sits at the end of the DER (SPKI). The
  // SPKI prefix for ed25519 is a fixed 12-byte header, so the raw key is the
  // final 32 bytes of the DER encoding.
  const der = publicKey.export({ type: "spki", format: "der" });
  const raw = der.subarray(der.length - 32);

  const keyType = Buffer.from("ssh-ed25519", "ascii");
  const blob = Buffer.concat([
    lengthPrefixed(keyType),
    lengthPrefixed(raw),
  ]);

  return `ssh-ed25519 ${blob.toString("base64")} ${comment}`;
}

/** Prefix a buffer with its 4-byte big-endian length (SSH wire "string"). */
function lengthPrefixed(buf: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}
