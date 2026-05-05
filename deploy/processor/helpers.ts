import { db } from "../shared";

export function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export async function appendLog(deploymentId: string, line: string) {
  // Strip null bytes — PostgreSQL text columns reject \0
  const sanitized = line.replace(/\0/g, "");
  await db.exec`UPDATE deployments SET logs = logs || ${sanitized + "\n"} WHERE id = ${deploymentId}`;
}
