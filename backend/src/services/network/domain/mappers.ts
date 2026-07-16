import type {
  SecurityRuleRow,
  SecurityRuleCredentialRow,
  RedirectRuleRow,
} from "../schemas.js";

// ─── Response Types ────────────────────────────────────────────────

export interface SecurityRuleCredentialResponse {
  id: string;
  username: string;
  createdAt: string;
}

export interface SecurityRuleResponse {
  id: string;
  projectId: string;
  name: string;
  path: string | null;
  credentials: SecurityRuleCredentialResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RedirectRuleResponse {
  id: string;
  projectId: string;
  fromPath: string;
  toPath: string;
  type: "temporary" | "permanent";
  createdAt: string;
  updatedAt: string;
}

// ─── Row Mappers ───────────────────────────────────────────────────

export function rowToCredential(row: SecurityRuleCredentialRow): SecurityRuleCredentialResponse {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  };
}

export function rowToSecurityRule(row: SecurityRuleRow, credentials: SecurityRuleCredentialRow[]): SecurityRuleResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    path: row.path,
    credentials: credentials.map(rowToCredential),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToRedirectRule(row: RedirectRuleRow): RedirectRuleResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    fromPath: row.from_path,
    toPath: row.to_path,
    type: row.type as "temporary" | "permanent",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
