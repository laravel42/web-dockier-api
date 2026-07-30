import type { ConnectionConfig } from "pg";
import { env } from "../config.js";

function databaseUrlRequiresSsl(databaseUrl: string): boolean {
  return (
    databaseUrl.includes("supabase.com") ||
    databaseUrl.includes("neon.tech") ||
    databaseUrl.includes("sslmode=require") ||
    databaseUrl.includes("sslmode=verify-full")
  );
}

/**
 * Build pg / pg-boss connection options from DATABASE_URL.
 * Supabase pooler requires SSL; Node rejects the chain unless configured.
 */
export function getPostgresConnectionConfig(connectionString?: string): ConnectionConfig {
  const url = connectionString ?? env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  // pg treats sslmode=require in the URL as strict verification; strip it when we
  // supply our own ssl options (Supabase pooler uses a chain Node rejects).
  const normalizedUrl = url.replace(/([?&])sslmode=[^&]*&?/g, "$1").replace(/[?&]$/, "");
  const config: ConnectionConfig = { connectionString: normalizedUrl };

  if (databaseUrlRequiresSsl(url)) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}
