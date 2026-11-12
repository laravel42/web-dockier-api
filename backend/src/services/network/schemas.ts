import { z } from "zod";

// These values are written into an nginx config by a root shell script on the
// host (legacy EC2 applier) and into Traefik middlewares (Dokploy). A newline, `{`,
// `;` or a quote there injected nginx directives — or, by closing the script's
// heredoc early, ran the rest of the value as root on the server.
const SAFE_PATH = /^[^\s{};#"'`\\]*$/;
/** Optional leading slash: appliers add it, and existing clients send both forms. */
const urlPath = z.string().min(1).max(500)
  .regex(SAFE_PATH, "Paths cannot contain spaces or any of { } ; # \" ' ` \\");
/** Shown in the browser's auth prompt; inside a quoted nginx string. */
const ruleLabel = z.string().min(1).max(200)
  .regex(/^[^\p{Cc}"\\]*$/u, "Names cannot contain line breaks, quotes or backslashes");
/** `:` separates user from hash in htpasswd and in an HTTP Basic Auth header. */
const basicAuthUsername = z.string().min(1).max(200)
  .regex(/^[^\p{Cc}:"\\]*$/u, "Usernames cannot contain line breaks, colons, quotes or backslashes");

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
  name: ruleLabel,
  // "" means "whole site", as before.
  path: z.union([z.literal(""), urlPath]).optional(),
  credentials: z.array(z.object({
    username: basicAuthUsername,
    password: z.string().min(1).max(200),
  })).optional(),
});

export const addCredentialBodySchema = z.object({
  username: basicAuthUsername,
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
  fromPath: urlPath,
  // A path or an absolute http(s) URL; neither needs the characters refused above.
  toPath: urlPath,
  type: z.enum(["temporary", "permanent"]).default("temporary"),
});

// ─── DB Row Types ───

import type { TableRow } from "../../shared/supabase/types.js";

export type SecurityRuleRow = TableRow<"security_rules">;

export type SecurityRuleCredentialRow = TableRow<"security_rule_credentials">;

export type RedirectRuleRow = TableRow<"redirect_rules">;
