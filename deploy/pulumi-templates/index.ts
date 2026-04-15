export type { DeployParams } from "./types";
export { buildAws } from "./aws";
export { buildGenericVPS } from "./generic-vps";
export { buildGcp } from "./gcp";
export { buildDockerUserData } from "./user-data";

import type { DeployParams } from "./types";
import { buildAws } from "./aws";
import { buildGenericVPS } from "./generic-vps";
import { buildGcp } from "./gcp";

/**
 * Registry of Pulumi program builders keyed by provider.
 * To add a new provider, create its builder in a new file and register it here.
 */
const providerBuilders: Record<string, (p: DeployParams) => string> = {
  aws: buildAws,
  gcp: buildGcp,
};

/** Generate a Pulumi TypeScript program for the given provider */
export function generatePulumiProgram(p: DeployParams): string {
  const builder = providerBuilders[p.provider];
  return builder ? builder(p) : buildGenericVPS(p);
}

/** Provider-specific Pulumi package dependencies */
const providerPkgDeps: Record<string, Record<string, string>> = {
  aws: { "@pulumi/aws": "^6.0.0", "@pulumi/docker": "^4.5.0" },
  gcp: { "@pulumi/gcp": "^8.0.0" },
};

/** Generate a Pulumi.yaml project file */
export function generatePulumiProject(appName: string, provider: string): string {
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
  const deps = {
    "@pulumi/pulumi": "^3.0.0",
    ...(providerPkgDeps[provider] || { "@pulumi/command": "^1.0.0" }),
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
