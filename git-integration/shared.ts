import { secret } from "encore.dev/config";
import { db as _db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

export const db = _db;

export const BedrockApiKey = secret("BedrockApiKey");
export const BedrockRegion = secret("BedrockRegion");
export const BedrockAccountId = secret("BedrockAccountId");

export interface GitRepo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

export interface GitConnectionResponse {
  id: string;
  userId: string;
  provider: string;
  label: string;
  repoUrl: string;
  endpoint: string;
  createdAt: string;
}
