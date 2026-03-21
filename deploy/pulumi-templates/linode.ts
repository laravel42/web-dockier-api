import type { DeployParams } from "./types";
import { buildDockerUserData } from "./user-data";

/** Generate a Pulumi TypeScript program for Linode/Akamai VPS */
export function buildLinode(p: DeployParams): string {
  const userData = buildDockerUserData(p);
  const managedDb = p.services.find(s => s.type === "database" && s.mode === "managed");
  const managedStorage = p.services.find(s => s.type === "storage" && s.mode === "managed");

  let dbBlock = "";
  if (managedDb) {
    dbBlock = `
// ── Managed Database ──
const db = new linode.DatabaseMysql("${p.appName}-db", {
  label: "${p.appName}-db",
  engineId: "mysql/8",
  region: region,
  type: "g6-nanode-1",
  clusterSize: 1,
  allowLists: ["0.0.0.0/0"],
});

export const dbHost = db.hostPrimary;
export const dbPort = pulumi.output(3306);
`;
  }

  let storageBlock = "";
  if (managedStorage) {
    storageBlock = `
// ── Object Storage ──
const bucket = new linode.ObjectStorageBucket("${p.appName}-storage", {
  label: "${p.appName}-storage",
  cluster: "us-east-1",
});

export const bucketName = bucket.label;
`;
  }

  return `import * as pulumi from "@pulumi/pulumi";
import * as linode from "@pulumi/linode";

// ─────────────────────────────────────────────────
// Linode/Akamai VPS
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const sshPublicKey = config.require("sshPublicKey");
const rootPassword = config.requireSecret("rootPassword");

// ── SSH Key ──
const sshKey = new linode.SshKey("${p.appName}-key", {
  label: "${p.appName}-key",
  sshKey: sshPublicKey,
});

// ── Firewall ──
const firewall = new linode.Firewall("${p.appName}-fw", {
  label: "${p.appName}-fw",
  inbounds: [
    { label: "ssh", action: "ACCEPT", protocol: "TCP", ports: "22", ipv4s: ["0.0.0.0/0"] },
    { label: "http", action: "ACCEPT", protocol: "TCP", ports: "80", ipv4s: ["0.0.0.0/0"] },
    { label: "https", action: "ACCEPT", protocol: "TCP", ports: "443", ipv4s: ["0.0.0.0/0"] },
  ],
  inboundPolicy: "DROP",
  outboundPolicy: "ACCEPT",
});

// ── Instance ──
const instance = new linode.Instance("${p.appName}", {
  label: "${p.appName}",
  type: "g6-nanode-1",
  region: region,
  image: "linode/ubuntu24.04",
  rootPass: rootPassword,
  authorizedKeys: [sshPublicKey],
  stackscriptData: {},
});

// Attach firewall to instance
new linode.FirewallDevice("${p.appName}-fw-device", {
  firewallId: firewall.id,
  entityId: instance.id,
  entityType: "linode",
});
${dbBlock}${storageBlock}
export const serverIp = instance.ipAddress;
export const appUrl = instance.ipAddress.apply((ip) => \`http://\${ip}\`);
`;
}
