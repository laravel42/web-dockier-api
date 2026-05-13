import { z } from "zod";
import { membershipRoleSchemaValues } from "../../shared/auth.js";

export const roleSchema = z.object({
  id: z.enum(membershipRoleSchemaValues),
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
});
