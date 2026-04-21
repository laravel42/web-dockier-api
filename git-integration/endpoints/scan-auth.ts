import { api, APIError } from "encore.dev/api";
import { db } from "../shared";

// ─── Get Connection Details for Scan (service-to-service) ───

export const getConnectionForScan = api(
  { expose: true, method: "GET", path: "/git/connections/:connectionId/scan-auth", auth: false },
  async (params: { connectionId: string }): Promise<{ provider: string; token: string; endpoint: string }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    return { provider: conn.provider, token: conn.personal_token, endpoint: conn.endpoint || "" };
  }
);
