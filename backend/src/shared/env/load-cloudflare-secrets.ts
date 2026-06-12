import { applyEnvRecord, parseSecretString } from "./apply-env-record.js";

function shouldLoadCloudflareSecrets(): boolean {
  if (process.env.LOAD_SECRETS_FROM === "file") return false;
  if (process.env.LOAD_SECRETS_FROM === "cloudflare") return true;
  if (process.env.CLOUDFLARE_SECRETS_BRIDGE_URL) return true;
  return false;
}

async function loadFromSecretsBridge(): Promise<void> {
  const bridgeUrl = process.env.CLOUDFLARE_SECRETS_BRIDGE_URL;
  const bridgeToken = process.env.CLOUDFLARE_SECRETS_BRIDGE_TOKEN;

  if (!bridgeUrl) {
    throw new Error(
      "LOAD_SECRETS_FROM=cloudflare requires CLOUDFLARE_SECRETS_BRIDGE_URL",
    );
  }

  if (!bridgeToken) {
    throw new Error(
      "LOAD_SECRETS_FROM=cloudflare requires CLOUDFLARE_SECRETS_BRIDGE_TOKEN",
    );
  }

  const response = await fetch(bridgeUrl, {
    headers: {
      Authorization: `Bearer ${bridgeToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Cloudflare secrets bridge returned ${response.status}: ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Cloudflare secrets bridge returned invalid JSON object");
  }

  applyEnvRecord(payload as Record<string, unknown>, "Cloudflare Secrets Store", {
    override: process.env.CLOUDFLARE_SECRETS_OVERRIDE === "true",
  });
}

async function loadFromInlineJson(): Promise<void> {
  const inline = process.env.CLOUDFLARE_ENV_JSON;
  if (!inline) return;

  applyEnvRecord(parseSecretString(inline), "CLOUDFLARE_ENV_JSON", {
    override: process.env.CLOUDFLARE_SECRETS_OVERRIDE === "true",
  });
}

export async function loadCloudflareSecretsIfConfigured(): Promise<void> {
  if (!shouldLoadCloudflareSecrets()) return;

  await loadFromInlineJson();

  if (process.env.CLOUDFLARE_SECRETS_BRIDGE_URL) {
    await loadFromSecretsBridge();
  }

  if (
    process.env.LOAD_SECRETS_FROM === "cloudflare" &&
    !process.env.CLOUDFLARE_SECRETS_BRIDGE_URL &&
    !process.env.CLOUDFLARE_ENV_JSON
  ) {
    throw new Error(
      "LOAD_SECRETS_FROM=cloudflare requires CLOUDFLARE_SECRETS_BRIDGE_URL or CLOUDFLARE_ENV_JSON",
    );
  }
}
