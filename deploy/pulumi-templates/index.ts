export type { DeployParams } from "./types";
export { buildAws } from "./aws";
export { buildDigitalOcean } from "./digitalocean";
export { buildHetzner } from "./hetzner";
export { buildVultr } from "./vultr";
export { buildLinode } from "./linode";
export { buildGenericVPS } from "./generic-vps";
export { buildDockerUserData } from "./user-data";

import type { DeployParams } from "./types";
import { buildAws } from "./aws";
import { buildDigitalOcean } from "./digitalocean";
import { buildHetzner } from "./hetzner";
import { buildVultr } from "./vultr";
import { buildLinode } from "./linode";
import { buildGenericVPS } from "./generic-vps";

/** Generate a Pulumi TypeScript program for the given provider */
export function generatePulumiProgram(p: DeployParams): string {
  switch (p.provider) {
    case "aws": return buildAws(p);
    case "digitalocean": return buildDigitalOcean(p);
    case "hetzner": return buildHetzner(p);
    case "vultr": return buildVultr(p);
    case "linode": return buildLinode(p);
    default: return buildGenericVPS(p);
  }
}

/** Generate a Pulumi.yaml project file */
export function generatePulumiProject(appName: string, provider: string): string {
  const runtimeDeps: Record<string, string[]> = {
    aws: ["@pulumi/pulumi", "@pulumi/aws"],
    digitalocean: ["@pulumi/pulumi", "@pulumi/digitalocean"],
    hetzner: ["@pulumi/pulumi", "@pulumi/hcloud"],
    vultr: ["@pulumi/pulumi", "@ediri/vultr"],
    linode: ["@pulumi/pulumi", "@pulumi/linode"],
  };
  const deps = runtimeDeps[provider] || ["@pulumi/pulumi", "@pulumi/command"];

  return `name: ${appName}
runtime:
  name: nodejs
  options:
    typescript: true
description: Deploy ${appName} to ${provider}
`;
}

/** Generate package.json for the Pulumi project */
export function generatePackageJson(appName: string, provider: string): string {
  const providerPkgs: Record<string, Record<string, string>> = {
    aws: { "@pulumi/aws": "^6.0.0", "@pulumi/docker": "^4.5.0" },
    digitalocean: { "@pulumi/digitalocean": "^4.0.0" },
    hetzner: { "@pulumi/hcloud": "^1.0.0" },
    vultr: { "@ediri/vultr": "^2.0.0" },
    linode: { "@pulumi/linode": "^4.0.0" },
  };
  const deps = {
    "@pulumi/pulumi": "^3.0.0",
    ...(providerPkgs[provider] || { "@pulumi/command": "^1.0.0" }),
  };

  return JSON.stringify({
    name: appName,
    main: "index.ts",
    dependencies: deps,
    devDependencies: { typescript: "^5.0.0", "@types/node": "^20.0.0" },
  }, null, 2);
}

/** Generate tsconfig.json for the Pulumi project */
export function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      strict: true,
      outDir: "bin",
      target: "es2020",
      module: "commonjs",
      moduleResolution: "node",
      sourceMap: true,
      experimentalDecorators: true,
      forceConsistentCasingInFileNames: true,
    },
    files: ["index.ts"],
  }, null, 2);
}
