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

import type { TableRow } from "../../shared/supabase/types.js";

export type SecurityRuleRow = TableRow<"security_rules">;

export type SecurityRuleCredentialRow = TableRow<"security_rule_credentials">;

export type RedirectRuleRow = TableRow<"redirect_rules">;
