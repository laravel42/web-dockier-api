import { z } from "zod";

export const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
});

export const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  systemKey: z.string().nullable(),
  isSystem: z.boolean(),
  isEditable: z.boolean(),
  isDeletable: z.boolean(),
  permissions: z.array(z.string()),
});
