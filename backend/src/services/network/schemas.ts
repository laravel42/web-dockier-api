import { z } from "zod";

// ─── Security Rules ───

export const securityRuleSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  name: z.string(),
  path: z.string().nullable(),
  credentials: z.array(z.object({
    id: z.uuid(),
    username: z.string(),
    createdAt: z.string(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createSecurityRuleBodySchema = z.object({
  name: z.string().min(1).max(200),
  path: z.string().max(500).optional(),
  credentials: z.array(z.object({
    username: z.string().min(1).max(200),
    password: z.string().min(1).max(200),
  })).optional(),
});

export const addCredentialBodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

// ─── Redirect Rules ───

export const redirectRuleSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  fromPath: z.string(),
  toPath: z.string(),
  type: z.enum(["temporary", "permanent"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRedirectRuleBodySchema = z.object({
  fromPath: z.string().min(1).max(500),
  toPath: z.string().min(1).max(500),
  type: z.enum(["temporary", "permanent"]).default("temporary"),
});

// ─── DB Row Types ───

export type SecurityRuleRow = {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  path: string | null;
  created_at: string;
  updated_at: string;
};

export type SecurityRuleCredentialRow = {
  id: string;
  security_rule_id: string;
  username: string;
  password_hash: string;
  created_at: string;
};

export type RedirectRuleRow = {
  id: string;
  organization_id: string;
  project_id: string;
  from_path: string;
  to_path: string;
  type: string;
  created_at: string;
  updated_at: string;
};
