#!/usr/bin/env tsx
/**
 * Push/list Dockier secrets in Cloudflare Secrets Store.
 *
 * Requires:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN  (Secrets Store Write)
 *   CLOUDFLARE_SECRETS_STORE_ID
 *
 * Optional:
 *   DOCKIER_SECRETS_FILE  (default: .env)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { parseEnvFileContent } from "../backend/src/shared/env/apply-env-record.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");

const DOCKIER_ENV_BUNDLE_NAME = "dockier-env";
const SKIP_PUSH_KEYS = new Set([
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_SECRETS_STORE_ID",
  "CLOUDFLARE_SECRETS_BRIDGE_URL",
  "CLOUDFLARE_SECRETS_BRIDGE_TOKEN",
  "LOAD_SECRETS_FROM",
]);

type CloudflareSecret = {
  id: string;
  name: string;
  status: string;
};

type CloudflareListResponse<T> = {
  success: boolean;
  errors?: Array<{ message: string }>;
  result?: T;
};

function loadBootstrapEnv(): void {
  const candidates = [resolve(workspaceRoot, ".env")];

  for (const path of candidates) {
    if (existsSync(path)) {
      loadEnv({ path, override: false });
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveSecretsFile(): string {
  const configured = process.env.DOCKIER_SECRETS_FILE?.trim();
  const path = configured ? resolve(workspaceRoot, configured) : resolve(workspaceRoot, ".env");
  if (!existsSync(path)) {
    throw new Error(`Secrets file not found: ${path}`);
  }
  return path;
}

function readSecretsRecord(): Record<string, string> {
  const path = resolveSecretsFile();
  const content = readFileSync(path, "utf8");
  const record = parseEnvFileContent(content);

  for (const key of SKIP_PUSH_KEYS) {
    delete record[key];
  }

  if (Object.keys(record).length === 0) {
    throw new Error(`No secrets found in ${path}`);
  }

  return record;
}

async function cloudflareRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const url = `https://api.cloudflare.com/client/v4${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as CloudflareListResponse<T>;
  if (!response.ok || !payload.success) {
    const message = payload.errors?.map((error) => error.message).join("; ") ?? response.statusText;
    throw new Error(`Cloudflare API error (${response.status}): ${message}`);
  }

  return payload.result as T;
}

async function listStoreSecrets(): Promise<CloudflareSecret[]> {
  const storeId = requireEnv("CLOUDFLARE_SECRETS_STORE_ID");
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const secrets: CloudflareSecret[] = [];
  let page = 1;

  while (true) {
    const batch = await cloudflareRequest<CloudflareSecret[]>(
      `/accounts/${accountId}/secrets_store/stores/${storeId}/secrets?per_page=100&page=${page}`,
    );

    secrets.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return secrets;
}

async function createSecret(name: string, value: string): Promise<void> {
  const storeId = requireEnv("CLOUDFLARE_SECRETS_STORE_ID");
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");

  await cloudflareRequest(
    `/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
    {
      method: "POST",
      body: JSON.stringify([
        {
          name,
          value,
          scopes: ["workers"],
          comment: "Managed by pnpm secrets:push",
        },
      ]),
    },
  );
}

async function updateSecret(secretId: string, value: string): Promise<void> {
  const storeId = requireEnv("CLOUDFLARE_SECRETS_STORE_ID");
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");

  await cloudflareRequest(
    `/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        value,
        scopes: ["workers"],
        comment: "Managed by pnpm secrets:push",
      }),
    },
  );
}

async function upsertSecret(
  name: string,
  value: string,
  existingByName: Map<string, CloudflareSecret>,
): Promise<"created" | "updated"> {
  const existing = existingByName.get(name);
  if (existing) {
    await updateSecret(existing.id, value);
    return "updated";
  }

  await createSecret(name, value);
  return "created";
}

async function pushSecrets(): Promise<void> {
  const record = readSecretsRecord();
  const existing = await listStoreSecrets();
  const existingByName = new Map(existing.map((secret) => [secret.name, secret]));

  let created = 0;
  let updated = 0;

  for (const [name, value] of Object.entries(record)) {
    const action = await upsertSecret(name, value, existingByName);
    if (action === "created") created += 1;
    if (action === "updated") updated += 1;
  }

  const bundleValue = JSON.stringify(record);
  const bundleAction = await upsertSecret(DOCKIER_ENV_BUNDLE_NAME, bundleValue, existingByName);
  if (bundleAction === "created") created += 1;
  if (bundleAction === "updated") updated += 1;

  console.log(
    `[secrets] Pushed ${Object.keys(record).length} variable(s) to Cloudflare Secrets Store (${created} created, ${updated} updated, plus ${DOCKIER_ENV_BUNDLE_NAME} bundle)`,
  );
}

async function listSecrets(): Promise<void> {
  const secrets = await listStoreSecrets();
  const names = secrets
    .filter((secret) => secret.status === "active")
    .map((secret) => secret.name)
    .sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    console.log("[secrets] No active secrets in store");
    return;
  }

  console.log(`[secrets] ${names.length} active secret(s):`);
  for (const name of names) {
    console.log(`  - ${name}`);
  }
}

async function createStore(name: string): Promise<void> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const result = await cloudflareRequest<{ id: string; name: string }>(
    `/accounts/${accountId}/secrets_store/stores`,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );

  console.log(`[secrets] Created store "${result.name}" (${result.id})`);
  console.log("Set CLOUDFLARE_SECRETS_STORE_ID in .env or your shell.");
}

async function main(): Promise<void> {
  loadBootstrapEnv();

  const command = process.argv[2] ?? "push";

  switch (command) {
    case "push":
      await pushSecrets();
      break;
    case "list":
      await listSecrets();
      break;
    case "store:create": {
      const storeName = process.argv[3] ?? "dockier";
      await createStore(storeName);
      break;
    }
    default:
      throw new Error(`Unknown command "${command}". Use: push | list | store:create [name]`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[secrets] ${message}`);
  process.exit(1);
});
