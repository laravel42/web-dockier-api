import { z } from "zod";

export const postDeployCommandSchema = z.object({
  command: z.string().min(1).max(500),
  enabled: z.boolean(),
  continueOnFailure: z.boolean(),
  timeout: z.number().int().positive().max(3600).optional(),
});
