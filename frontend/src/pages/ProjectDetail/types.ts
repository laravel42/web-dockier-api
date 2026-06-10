export type { Project } from "../../types";
export type { RepoStats } from "../../types";
export type { Deployment as DeployInfo } from "../../types";
export type { Provider as ProviderInfo } from "../../types";

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorAvatar: string;
  date: string;
  url: string;
}
