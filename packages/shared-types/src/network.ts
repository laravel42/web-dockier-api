export type RedirectType = "temporary" | "permanent";

export interface SecurityRuleCredential {
  id: string;
  username: string;
  createdAt: string;
}

export interface SecurityRule {
  id: string;
  projectId: string;
  name: string;
  path: string | null;
  credentials: SecurityRuleCredential[];
  createdAt: string;
  updatedAt: string;
}

export interface RedirectRule {
  id: string;
  projectId: string;
  fromPath: string;
  toPath: string;
  type: RedirectType;
  createdAt: string;
  updatedAt: string;
}
