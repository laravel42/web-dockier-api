import { z } from "zod";
import { membershipRoleSchemaValues } from "../../shared/auth.js";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  country: z.string(),
  language: z.string(),
  timezone: z.string(),
  role: z.enum(membershipRoleSchemaValues),
  roleId: z.enum(membershipRoleSchemaValues),
  roleName: z.string(),
  tenantId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export const listUsersResponseSchema = z.object({
  users: z.array(userSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
