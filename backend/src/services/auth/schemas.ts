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
  companyName: z.string(),
  legalName: z.string(),
  taxId: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
  billingEmail: z.string(),
});
