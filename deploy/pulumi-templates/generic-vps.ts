import type { DeployParams } from "./types";
import { buildDockerUserData } from "./user-data";

/** Generate a generic Pulumi program placeholder for unsupported providers */
export function buildGenericVPS(p: DeployParams): string {
  const userData = buildDockerUserData(p);

  return `import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";

// ─────────────────────────────────────────────────
// Generic VPS Deploy (${p.provider})
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────
// This template uses @pulumi/command to run provisioning
// on an existing server via SSH. Set the serverIp config.

const config = new pulumi.Config();
const serverIp = config.require("serverIp");
const sshPrivateKey = config.requireSecret("sshPrivateKey");

const provision = new command.remote.Command("provision-${p.appName}", {
  connection: {
    host: serverIp,
    user: "root",
    privateKey: sshPrivateKey,
  },
  create: ${JSON.stringify(userData)},
});

export const appUrl = pulumi.interpolate\`http://\${serverIp}\`;
export const provisionResult = provision.stdout;
`;
}
