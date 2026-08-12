import { BacklogCard } from "@/components/projects/BacklogCard";
import { ContributorsRailSection } from "@/components/projects/ContributorsRailSection";
import { NotesRailSection } from "@/components/projects/NotesRailSection";
import { TimeCard } from "@/components/projects/TimeCard";
import type { ProjectDetails, User } from "@/lib/data/project-details";

type RightMetaPanelProps = {
  project: ProjectDetails;
};

export function RightMetaPanel({ project }: RightMetaPanelProps) {
  const workstreamAssignees = project.workstreams.flatMap((group) =>
    group.tasks.flatMap((task) => (task.assignee ? [task.assignee] : [])),
  );
  const projectMembers: User[] = (project.source?.members ?? []).map(
    (name) => ({
      id: name.trim().toLowerCase().replace(/\s+/g, "-"),
      name,
    }),
  );
  const contributors = [
    ...project.backlog.picUsers,
    ...(project.backlog.supportUsers ?? []),
    ...projectMembers,
    ...workstreamAssignees,
  ];

  return (
    <div className="divide-border flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-5">
      <BacklogCard backlog={project.backlog} />
      <ContributorsRailSection users={contributors} />
      <TimeCard time={project.time} />
      <NotesRailSection notes={project.notes} />
    </div>
  );
}
