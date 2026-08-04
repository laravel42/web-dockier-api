export type CommandStatus = "running" | "finished" | "failed" | "timed_out";

export interface Command {
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
