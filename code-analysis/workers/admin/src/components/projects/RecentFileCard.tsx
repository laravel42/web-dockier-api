import { DotsThree } from "@/components/icons/lucide-icons";
import { FileTypeIcon } from "@/components/projects/FileTypeIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectFile } from "@/lib/data/project-details";

type RecentFileCardProps = {
  file: ProjectFile;
  onEdit?: (fileId: string) => void;
  onDelete?: (fileId: string) => void;
};

export function RecentFileCard({
  file,
  onEdit,
  onDelete,
}: RecentFileCardProps) {
  const sizeLabel =
    file.isLinkAsset || file.sizeMB === 0
      ? "Link"
      : `${file.sizeMB.toFixed(1)} MB`;

  return (
    <div className="border-border bg-card flex items-center justify-between rounded-2xl border px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <FileTypeIcon
          type={file.type}
          wrapperSize={44}
          iconSize={40}
          background={false}
        />
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-medium">
            {file.name}
          </div>
          <div className="text-muted-foreground text-sm">{sizeLabel}</div>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground h-7 w-7"
            aria-label={`Open actions for ${file.name}`}
          >
            <DotsThree className="h-4 w-4" weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit?.(file.id)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete?.(file.id)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
