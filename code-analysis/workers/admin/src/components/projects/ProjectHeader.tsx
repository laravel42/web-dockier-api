import { PencilSimpleLine, Star } from "@/components/icons/lucide-icons";
import {
  ArrowsClockwise,
  GitMerge,
  Globe,
  Timer,
  Users,
} from "@/components/icons/lucide-icons";
import { PriorityBadge, type PriorityLevel } from "@/components/priority-badge";
import { MetaChipsRow } from "@/components/projects/MetaChipsRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectDetails } from "@/lib/data/project-details";

type ProjectHeaderProps = {
  project: ProjectDetails;
  onEditProject?: () => void;
};

export function ProjectHeader({ project, onEditProject }: ProjectHeaderProps) {
  const projectCode = `PM-OPS-${project.id.padStart(2, "0")}`;
  const ownerLabel = project.source?.members?.length
    ? `${project.source.members.length} contributors`
    : "Ops owned";
  const metaItems = [
    { label: "Code", value: projectCode, icon: null },
    {
      label: "",
      value: (
        <PriorityBadge
          level={project.meta.priorityLabel.toLowerCase() as PriorityLevel}
          appearance="inline"
          size="sm"
        />
      ),
      icon: null,
    },
    {
      label: "",
      value: project.meta.locationLabel,
      icon: <Globe className="h-4 w-4" />,
    },
    {
      label: "Cycle",
      value: project.meta.sprintLabel,
      icon: <Timer className="h-4 w-4" />,
    },
    {
      label: "Updated",
      value: project.meta.lastSyncLabel,
      icon: <ArrowsClockwise className="h-4 w-4" />,
    },
  ];

  return (
    <section className="mt-4 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-foreground text-2xl leading-tight font-semibold">
            {project.name}
          </h1>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="flex items-center gap-1 border-none bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-50"
            >
              <Star className="h-3 w-3" />
              Build track
            </Badge>
            <Badge
              variant="outline"
              className="flex items-center gap-1 border-none bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-100"
            >
              <Users className="h-3 w-3" />
              {ownerLabel}
            </Badge>
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground flex items-center gap-1 border-none"
            >
              <GitMerge className="h-3 w-3" />
              Ops system
            </Badge>
          </div>
        </div>

        {onEditProject && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit project"
            className="text-muted-foreground hover:text-foreground rounded-lg"
            onClick={onEditProject}
          >
            <PencilSimpleLine className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-3">
        <MetaChipsRow items={metaItems} />
      </div>
    </section>
  );
}
