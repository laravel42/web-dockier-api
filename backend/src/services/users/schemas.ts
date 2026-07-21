import { z } from "zod";
import { paginationMetaSchema } from "../../shared/schemas/responses.js";

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  country: z.string(),
  language: z.string(),
  timezone: z.string(),
  tenantId: z.uuid().nullable(),
  createdAt: z.string(),
});

export const userWithRoleSchema = userSchema.extend({
  roleId: z.string(),
  roleName: z.string(),
  isOwner: z.boolean(),
});

export const listUsersResponseSchema = z.object({
  users: z.array(userWithRoleSchema),
  pagination: paginationMetaSchema,
});
