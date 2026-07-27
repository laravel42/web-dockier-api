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
  userId: z.uuid(),
  tenantId: z.uuid(),
});

export const membershipSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  roleName: z.string(),
  isOwner: z.boolean(),
});

export const authMeSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  name: z.string(),
  tenantId: z.uuid(),
  roleId: z.string(),
  roleName: z.string(),
  systemKey: z.string().nullable(),
  isOwner: z.boolean(),
  permissions: z.array(z.string()),
  memberships: z.array(membershipSchema),
  twoFactorEnabled: z.boolean(),
});

export const billingDetailsSchema = z.object({
  companyName: z.string().max(200),
  legalName: z.string().max(200),
  taxId: z.string().max(50),
  addressLine1: z.string().max(300),
  addressLine2: z.string().max(300),
  city: z.string().max(100),
  state: z.string().max(100),
  postalCode: z.string().max(20),
  country: z.string().max(100),
  billingEmail: z.email().max(254),
});
