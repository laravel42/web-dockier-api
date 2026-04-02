import { Topic } from "encore.dev/pubsub";
import { secret } from "encore.dev/config";
import { db as _db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

export const db = _db;

export const DeployCallbackUrl = secret("DeployCallbackUrl");

// ─── Interfaces ───

export interface ServerProvider {
  id: string;
  provider: "digitalocean" | "hetzner" | "vultr" | "linode" | "aws" | "upcloud" | "katapult" | "hostinger";
  label: string;
  apiKey: string;
  apiSecret: string;
  region: string;
  createdAt: string;
}

export interface Deployment {
  id: string;
  providerId: string;
  gitConnectionId: string;
  repo: string;
  branch: string;
  status: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderResponse {
  id: string;
  provider: string;
  label: string;
  region: string;
  appRunnerConnectionArn?: string;
  createdAt: string;
}

export interface DeployEvent {
  deploymentId: string;
  appId: string;
  providerId: string;
  gitConnectionId: string;
  repo: string;
  branch: string;
  tofuScript: string;
  techStack: string[];
  primaryLanguage: string;
  registryUrl: string;
  deployStrategy: string;
  buildMethod: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
}

export const deployTopic = new Topic<DeployEvent>("deployments", {
  deliveryGuarantee: "at-least-once",
});
