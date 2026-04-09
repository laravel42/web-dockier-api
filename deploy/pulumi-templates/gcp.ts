import type { DeployParams } from "./types";
import { buildDockerUserData } from "./user-data";

/** Generate a Pulumi TypeScript program for GCP */
export function buildGcp(p: DeployParams): string {
  if (p.deployStrategy === "vps") return buildGcpComputeEngine(p);
  if (p.deployStrategy === "managed") return buildGcpCloudRun(p);
  // future: app-engine, static
  return buildGcpComputeEngine(p);
}

function buildGcpComputeEngine(p: DeployParams): string {
  const userData = buildDockerUserData(p);
  const managedDb = p.services.find(s => s.type === "database" && s.mode === "managed");
  const managedStorage = p.services.find(s => s.type === "storage" && s.mode === "managed");

  let dbBlock = "";
  if (managedDb) {
    dbBlock = `
// ── Cloud SQL (PostgreSQL) ──
const dbInstance = new gcp.sql.DatabaseInstance("${p.appName}-db", {
  name: "${p.appName}-db",
  databaseVersion: "POSTGRES_16",
  region: region,
  deletionProtection: false,
  settings: {
    tier: "db-f1-micro",
    ipConfiguration: {
      authorizedNetworks: [{ name: "all", value: "0.0.0.0/0" }],
    },
  },
});

const database = new gcp.sql.Database("${p.appName}-database", {
  name: "${p.appName}",
  instance: dbInstance.name,
});

const dbUser = new gcp.sql.User("${p.appName}-db-user", {
  name: "appuser",
  instance: dbInstance.name,
  password: "apppass123",
});

export const dbHost = dbInstance.publicIpAddress;
export const dbName = database.name;
`;
  }

  let storageBlock = "";
  if (managedStorage) {
    storageBlock = `
// ── Cloud Storage ──
const bucket = new gcp.storage.Bucket("${p.appName}-storage", {
  name: "${p.appName}-storage",
  location: region,
  forceDestroy: true,
  uniformBucketLevelAccess: true,
});

export const bucketName = bucket.name;
`;
  }

  return `import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// ─────────────────────────────────────────────────
// GCP Compute Engine VPS
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const sshPublicKey = config.require("sshPublicKey");

// ── Pick an available zone (prefer -b, -c, -f over -a for better availability) ──
const zones = gcp.compute.getZonesOutput({ region, status: "UP" });
const zone = config.get("zone") || zones.names.apply(zs => {
  const preferred = ["-b", "-c", "-f", "-a"];
  for (const suffix of preferred) {
    const match = zs.find(z => z.endsWith(suffix));
    if (match) return match;
  }
  return zs[0] || \`\${region}-b\`;
});

// ── Network (use default VPC to avoid orphaned resources) ──
const network = gcp.compute.getNetworkOutput({ name: "default" });

// ── Firewall ──
const firewall = new gcp.compute.Firewall("${p.appName}-fw", {
  name: "${p.appName}-fw",
  network: network.selfLink,
  allows: [
    { protocol: "tcp", ports: ["22", "80", "443"] },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["${p.appName}-server"],
});

// ── Static IP ──
const staticIp = new gcp.compute.Address("${p.appName}-ip", {
  name: "${p.appName}-ip",
  region: region,
});

// ── Instance ──
const instance = new gcp.compute.Instance("${p.appName}", {
  name: "${p.appName}",
  machineType: "${p.instanceType || "n2d-standard-2"}",
  zone: zone,
  tags: ["${p.appName}-server"],
  scheduling: {
    automaticRestart: true,
    provisioningModel: "STANDARD",
  },
  bootDisk: {
    initializeParams: {
      image: "ubuntu-os-cloud/ubuntu-2404-lts-amd64",
      size: 30,
      type: "pd-balanced",
    },
  },
  networkInterfaces: [{
    network: network.selfLink,
    accessConfigs: [{ natIp: staticIp.address }],
  }],
  metadata: {
    "ssh-keys": \`root:\${sshPublicKey}\`,
  },
  metadataStartupScript: \`${userData.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`,
});
${dbBlock}${storageBlock}
export const serverIp = staticIp.address;
export const appUrl = staticIp.address.apply((ip) => \`http://\${ip}\`);
`;
}

function buildGcpCloudRun(p: DeployParams): string {
  const managedDb = p.services.find(s => s.type === "database" && s.mode === "managed");
  const managedStorage = p.services.find(s => s.type === "storage" && s.mode === "managed");

  // Parse CPU/memory from instanceType (e.g. "1 vCPU / 512 MB" or fallback)
  const cpuMatch = p.instanceType?.match(/([\d.]+)\s*vCPU/i) || p.instanceType?.match(/([\d.]+)-cpu/i);
  const memMatch = p.instanceType?.match(/([\d.]+)\s*GB/i) || p.instanceType?.match(/([\d.]+)Mi/i);
  const cpu = cpuMatch ? cpuMatch[1] : "1";
  const memoryGb = memMatch ? memMatch[1] : "512Mi";
  const memory = memoryGb.includes("Mi") ? memoryGb : `${Math.round(parseFloat(memoryGb) * 1024)}Mi`;

  let dbBlock = "";
  let dbEnvBlock = "";
  if (managedDb) {
    dbBlock = `
// ── Cloud SQL (PostgreSQL) ──
const dbInstance = new gcp.sql.DatabaseInstance("${p.appName}-db", {
  name: "${p.appName}-db",
  databaseVersion: "POSTGRES_16",
  region: region,
  deletionProtection: false,
  settings: {
    tier: "db-f1-micro",
    ipConfiguration: {
      ipv4Enabled: true,
      authorizedNetworks: [{ name: "all", value: "0.0.0.0/0" }],
    },
  },
});

const database = new gcp.sql.Database("${p.appName}-database", {
  name: "${p.appName}",
  instance: dbInstance.name,
});

const dbUser = new gcp.sql.User("${p.appName}-db-user", {
  name: "appuser",
  instance: dbInstance.name,
  password: "apppass123",
});

export const dbHost = dbInstance.publicIpAddress;
export const dbName = database.name;
`;
    dbEnvBlock = `
        { name: "DATABASE_HOST", value: dbInstance.publicIpAddress },
        { name: "DATABASE_NAME", value: "${p.appName}" },
        { name: "DATABASE_USER", value: "appuser" },
        { name: "DATABASE_PASSWORD", value: "apppass123" },`;
  }

  let storageBlock = "";
  let storageEnvBlock = "";
  if (managedStorage) {
    storageBlock = `
// ── Cloud Storage ──
const bucket = new gcp.storage.Bucket("${p.appName}-storage", {
  name: "${p.appName}-storage",
  location: region,
  forceDestroy: true,
  uniformBucketLevelAccess: true,
});

export const bucketName = bucket.name;
`;
    storageEnvBlock = `
        { name: "STORAGE_BUCKET", value: bucket.name },`;
  }

  return `import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// ─────────────────────────────────────────────────
// GCP Cloud Run + Artifact Registry
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");

// Image URI is set by the deploy processor after pushing to Artifact Registry
const imageUri = config.require("imageUri");

// ── Enable required APIs ──
const artifactRegistryApi = new gcp.projects.Service("artifactregistry-api", {
  service: "artifactregistry.googleapis.com",
  disableOnDestroy: false,
});

const cloudRunApi = new gcp.projects.Service("cloudrun-api", {
  service: "run.googleapis.com",
  disableOnDestroy: false,
});

// ── Artifact Registry Repository (created by deploy processor, imported here) ──
const registry = new gcp.artifactregistry.Repository("${p.appName}-repo", {
  repositoryId: "${p.appName}",
  location: region,
  format: "DOCKER",
  cleanupPolicyDryRun: false,
}, { dependsOn: [artifactRegistryApi], import: \`projects/\${project}/locations/\${region}/repositories/${p.appName}\` });
${dbBlock}${storageBlock}
// ── Cloud Run Service ──
const service = new gcp.cloudrunv2.Service("${p.appName}", {
  name: "${p.appName}",
  location: region,
  deletionProtection: false,
  ingress: "INGRESS_TRAFFIC_ALL",
  template: {
    scaling: {
      minInstanceCount: 0,
      maxInstanceCount: 10,
    },
    containers: [{
      image: imageUri,
      ports: { containerPort: ${p.runtime.port}, name: "http1" },
      resources: {
        limits: {
          cpu: "${cpu}",
          memory: "${memory}",
        },
      },
      envs: [
        { name: "NODE_ENV", value: "production" },${dbEnvBlock}${storageEnvBlock}
      ],
    }],
  },
}, { dependsOn: [cloudRunApi] });

// ── Allow unauthenticated access ──
const iamMember = new gcp.cloudrunv2.ServiceIamMember("${p.appName}-public", {
  name: service.name,
  location: region,
  role: "roles/run.invoker",
  member: "allUsers",
});

export const serviceUrl = service.uri;
export const appUrl = service.uri;
`;
}
