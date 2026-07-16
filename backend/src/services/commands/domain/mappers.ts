import type { CommandRow } from "../schemas.js";

export type CommandStatus = "running" | "finished" | "failed" | "timed_out";

export interface CommandResponse {
  id: string;
  projectId: string;
  userId: string;
  command: string;
  status: CommandStatus;
  output: string;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export function rowToCommand(row: CommandRow): CommandResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    command: row.command,
    status: row.status as CommandStatus,
    output: row.output,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}
