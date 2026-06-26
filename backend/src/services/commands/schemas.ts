import { z } from "zod";

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

export type CommandRow = {
  id: string;
  organization_id: string;
  project_id: string;
  user_id: string;
  command: string;
  status: string;
  output: string;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};
