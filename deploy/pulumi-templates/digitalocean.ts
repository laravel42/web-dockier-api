import type { DeployParams } from "./types";

/** Generate a Pulumi TypeScript program for DigitalOcean App Platform */
export function buildDigitalOcean(p: DeployParams): string {
  const hasDb = p.techStack.some(s =>
    ["laravel", "django", "rails", "spring", "prisma", "typeorm"].includes(s.toLowerCase())
  );
  const managedDb = p.services.find(s => s.type === "database" && s.mode === "managed");
  const managedCache = p.services.find(s => s.type === "cache" && s.mode === "managed");
  const managedStorage = p.services.find(s => s.type === "storage" && s.mode === "managed");

  let dbBlock = "";
  if (managedDb || hasDb) {
    dbBlock = `
// ── Managed Database ──
const db = new digitalocean.DatabaseCluster("${p.appName}-db", {
  name: "${p.appName}-db",
  engine: "pg",
  version: "16",
  size: "db-s-1vcpu-1gb",
  region: region,
  nodeCount: 1,
});

export const dbHost = db.host;
export const dbPort = db.port;
export const dbName = db.database;
export const dbUser = db.user;
export const dbPassword = db.password;
`;
  }

  let cacheBlock = "";
  if (managedCache) {
    cacheBlock = `
// ── Managed Redis ──
const redis = new digitalocean.DatabaseCluster("${p.appName}-redis", {
  name: "${p.appName}-redis",
  engine: "redis",
  version: "7",
  size: "db-s-1vcpu-1gb",
  region: region,
  nodeCount: 1,
});

export const redisHost = redis.host;
export const redisPort = redis.port;
`;
  }

  let storageBlock = "";
  if (managedStorage) {
    storageBlock = `
// ── Object Storage ──
const bucket = new digitalocean.SpacesBucket("${p.appName}-storage", {
  name: "${p.appName}-storage",
  region: region,
  acl: "private",
});

export const bucketName = bucket.name;
export const bucketEndpoint = bucket.bucketDomainName;
`;
  }

  return `import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";

// ─────────────────────────────────────────────────
// DigitalOcean App Platform
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";

const app = new digitalocean.App("${p.appName}", {
  spec: {
    name: "${p.appName}",
    region: region,
    services: [{
      name: "${p.appName}",
      github: {
        repo: "${p.repo}",
        branch: "${p.branch}",
        deployOnPush: true,
      },
      buildCommand: ${JSON.stringify(p.runtime.buildCmd)},
      runCommand: ${JSON.stringify(p.runtime.startCmd)},
      httpPort: ${p.runtime.port},
      instanceCount: 1,
      instanceSizeSlug: "apps-s-1vcpu-0.5gb",
      envs: [
        { key: "APP_ENV", value: "production" },
        { key: "PORT", value: "${p.runtime.port}" },
      ],
    }],
  },
});
${dbBlock}${cacheBlock}${storageBlock}
export const appUrl = app.liveUrl;
export const appId = app.id;
`;
}
