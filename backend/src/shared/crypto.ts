import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./config.js";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = env.ENV_ENCRYPTION_KEY;
  if (!key) throw new Error("ENV_ENCRYPTION_KEY is not configured. Add a 64-char hex key to your .env file and restart the server.");
  // Accept either a 64-char hex string (32 bytes) or a 32-byte raw string
  if (key.length === 64) return Buffer.from(key, "hex");
  if (key.length === 32) return Buffer.from(key, "utf8");
  throw new Error("ENV_ENCRYPTION_KEY must be 32 bytes (64 hex chars or 32 ASCII chars)");
}

export interface EncryptedPayload {
  encrypted: string; // base64
  iv: string;        // base64
  authTag: string;   // base64
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Encrypt a JSON-serializable value into a single opaque string.
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptJson(data: unknown): string {
  const plaintext = JSON.stringify(data);
  const { encrypted, iv, authTag } = encrypt(plaintext);
  return `${iv}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string produced by encryptJson back into the original value.
 */
export function decryptJson(encoded: string): unknown {
  const [iv, authTag, encrypted] = encoded.split(":");
  if (!iv || !authTag || !encrypted) throw new Error("Invalid encrypted payload format");
  const plaintext = decrypt({ encrypted, iv, authTag });
  return JSON.parse(plaintext);
}
