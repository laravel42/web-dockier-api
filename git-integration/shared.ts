import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";

export const db = new SQLDatabase("gitintegration", { migrations: "./migrations" });

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
