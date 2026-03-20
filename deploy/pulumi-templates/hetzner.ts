import type { DeployParams } from "./types";
import { buildDockerUserData } from "./user-data";

/** Generate a Pulumi TypeScript program for Hetzner Cloud VPS */
export function buildHetzner(p: DeployParams): string {
  const userData = buildDockerUserData(p);

  return `import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";

// ─────────────────────────────────────────────────
// Hetzner Cloud VPS
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const sshPublicKey = config.require("sshPublicKey");

// ── SSH Key ──
const sshKey = new hcloud.SshKey("${p.appName}-key", {
  name: "${p.appName}-key",
  publicKey: sshPublicKey,
});

// ── Firewall ──
const firewall = new hcloud.Firewall("${p.appName}-fw", {
  name: "${p.appName}-fw",
  rules: [
    { direction: "in", protocol: "tcp", port: "22", sourceIps: ["0.0.0.0/0", "::/0"] },
    { direction: "in", protocol: "tcp", port: "80", sourceIps: ["0.0.0.0/0", "::/0"] },
    { direction: "in", protocol: "tcp", port: "443", sourceIps: ["0.0.0.0/0", "::/0"] },
  ],
});

// ── Server ──
const server = new hcloud.Server("${p.appName}", {
  name: "${p.appName}",
  serverType: "cx22",
  image: "ubuntu-24.04",
  location: region,
  sshKeys: [sshKey.id],
  firewallIds: [firewall.id],
  userData: \`${userData.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`,
});

export const serverIp = server.ipv4Address;
export const appUrl = pulumi.interpolate\`http://\${server.ipv4Address}\`;
`;
}
