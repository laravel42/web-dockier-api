import { z } from "zod";

export const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
});
