import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db } from "../shared";

export const listSshKeys = api(
  { method: "GET", path: "/deploy/ssh-keys", auth: true },
  async (): Promise<{ keys: Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> }> => {
    const authData = getAuthData()!;
    const rows = db.query<{ id: string; label: string; public_key: string; fingerprint: string; created_at: Date }>`
      SELECT id, label, public_key, fingerprint, created_at FROM ssh_keys WHERE user_id = ${authData.userID} ORDER BY created_at DESC`;
    const keys: Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> = [];
    for await (const row of rows) {
      keys.push({ id: row.id, label: row.label, publicKey: row.public_key, fingerprint: row.fingerprint, createdAt: row.created_at.toISOString() });
    }
    return { keys };
  }
);

export const addSshKey = api(
  { method: "POST", path: "/deploy/ssh-keys", auth: true },
  async (params: { label: string; publicKey: string }): Promise<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const pubKey = params.publicKey.trim();
    if (!pubKey.startsWith("ssh-") && !pubKey.startsWith("ecdsa-")) {
      throw APIError.invalidArgument("Invalid SSH public key format. Must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2.");
    }
    const parts = pubKey.split(/\s+/);
    const fingerprint = parts.length >= 2 ? `SHA256:${parts[1].slice(0, 16)}...` : "";
    await db.exec`INSERT INTO ssh_keys (id, user_id, label, public_key, fingerprint, created_at) VALUES (${id}, ${authData.userID}, ${params.label}, ${pubKey}, ${fingerprint}, NOW())`;
    return { id, label: params.label, publicKey: pubKey, fingerprint, createdAt: new Date().toISOString() };
  }
);

export const deleteSshKey = api(
  { method: "DELETE", path: "/deploy/ssh-keys/:keyId", auth: true },
  async (params: { keyId: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    await db.exec`DELETE FROM ssh_keys WHERE id = ${params.keyId} AND user_id = ${authData.userID}`;
    return { success: true };
  }
);
