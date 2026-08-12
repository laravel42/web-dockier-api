import { CreateTaskContent } from "../../components/todo/create-task-content";
import { projects } from "../../data/data";

function parseDueDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function CreateTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; due?: string }>;
}) {
  const params = await searchParams;
  const defaultProjectId = projects.some(
    (project) => project.id === params.project,
  )
    ? params.project
    : undefined;

  return (
    <CreateTaskContent
      defaultProjectId={defaultProjectId}
      defaultDueDate={parseDueDate(params.due)}
    />
  );
}
