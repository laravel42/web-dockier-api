import type { DeployParams } from "./types";
import { buildDockerUserData } from "./user-data";

/** Generate a Pulumi TypeScript program for Vultr VPS */
export function buildVultr(p: DeployParams): string {
  const userData = buildDockerUserData(p);
  const managedDb = p.services.find(s => s.type === "database" && s.mode === "managed");
  const managedStorage = p.services.find(s => s.type === "storage" && s.mode === "managed");

  let dbBlock = "";
  if (managedDb) {
    dbBlock = `
// ── Managed Database ──
const db = new vultr.Database("${p.appName}-db", {
  label: "${p.appName}-db",
  databaseEngine: "pg",
  databaseEngineVersion: "16",
  region: region,
  plan: "vultr-dbaas-startup-cc-1-55-2",
  clusterTimeZone: "UTC",
});

export const dbHost = db.host;
export const dbPort = db.port;
export const dbName = db.dbname;
export const dbUser = db.user;
export const dbPassword = db.password;
`;
  }

  let storageBlock = "";
  if (managedStorage) {
    storageBlock = `
// ── Object Storage ──
const storage = new vultr.ObjectStorage("${p.appName}-storage", {
  label: "${p.appName}-storage",
  clusterId: 2, // ewr1
});

export const storageEndpoint = storage.s3Hostname;
`;
  }

  return `import * as pulumi from "@pulumi/pulumi";
import * as vultr from "@ediri/vultr";

// ─────────────────────────────────────────────────
// Vultr VPS
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const sshPublicKey = config.require("sshPublicKey");

// ── SSH Key ──
const sshKey = new vultr.SshKey("${p.appName}-key", {
  name: "${p.appName}-key",
  sshKey: sshPublicKey,
});

// ── Firewall ──
const fwGroup = new vultr.FirewallGroup("${p.appName}-fw", {
  description: "${p.appName} firewall",
});

new vultr.FirewallRule("${p.appName}-ssh", {
  firewallGroupId: fwGroup.id,
  protocol: "tcp",
  ipType: "v4",
  subnet: "0.0.0.0",
  subnetSize: 0,
  port: "22",
});

new vultr.FirewallRule("${p.appName}-http", {
  firewallGroupId: fwGroup.id,
  protocol: "tcp",
  ipType: "v4",
  subnet: "0.0.0.0",
  subnetSize: 0,
  port: "80",
});

new vultr.FirewallRule("${p.appName}-https", {
  firewallGroupId: fwGroup.id,
  protocol: "tcp",
  ipType: "v4",
  subnet: "0.0.0.0",
  subnetSize: 0,
  port: "443",
});

// ── Instance ──
const instance = new vultr.Instance("${p.appName}", {
  plan: "vc2-1c-1gb",
  region: region,
  osId: 2284, // Ubuntu 24.04
  label: "${p.appName}",
  hostname: "${p.appName}",
  sshKeyIds: [sshKey.id],
  firewallGroupId: fwGroup.id,
  userData: \`${userData.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`,
});
${dbBlock}${storageBlock}
export const serverIp = instance.mainIp;
export const appUrl = instance.mainIp.apply((ip) => \`http://\${ip}\`);
`;
}
