import { z } from "zod";

export const registerStartBodySchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(2).max(120),
  tenantName: z.string().trim().min(2).max(120).optional(),
  redirectTo: z.string().url().optional(),
});

export const registerStartResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const authSessionSchema = z.object({
  token: z.string(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

export const membershipSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  roleName: z.string(),
  isOwner: z.boolean(),
});

export const authMeSchema = z.object({
  userId: z.string().uuid(),
  email: z.email(),
  name: z.string(),
  tenantId: z.string().uuid(),
  roleId: z.string(),
  roleName: z.string(),
  systemKey: z.string().nullable(),
  isOwner: z.boolean(),
  permissions: z.array(z.string()),
  memberships: z.array(membershipSchema),
  twoFactorEnabled: z.boolean(),
});
