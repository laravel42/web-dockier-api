import { z } from "zod";
import type { TableRow } from "../../shared/supabase/types.js";

export const commandStatusSchema = z.enum(["running", "finished", "failed", "timed_out"]);

export const commandSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  userId: z.string(),
  command: z.string(),
  status: commandStatusSchema,
  output: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type CommandRow = TableRow<"commands">;
