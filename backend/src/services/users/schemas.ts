import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  country: z.string(),
  language: z.string(),
  timezone: z.string(),
  tenantId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export const userWithRoleSchema = userSchema.extend({
  roleId: z.string(),
  roleName: z.string(),
  isOwner: z.boolean(),
});

export const listUsersResponseSchema = z.object({
  users: z.array(userWithRoleSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
