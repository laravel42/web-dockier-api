import { format } from "date-fns";

import { DotsThree, File, Waveform } from "@/components/icons/lucide-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectNote } from "@/lib/data/project-details";

type NoteCardProps = {
  note: ProjectNote;
  onEdit?: (noteId: string) => void;
  onDelete?: (noteId: string) => void;
  onClick?: () => void;
};

export function NoteCard({ note, onEdit, onDelete, onClick }: NoteCardProps) {
  const isAudio = note.noteType === "audio";
  return (
    <div
      className="border-border bg-muted flex flex-col gap-1 rounded-xl border p-1 transition-shadow hover:cursor-pointer hover:shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2 p-1">
        <div className="flex h-6 w-6 items-center justify-center">
          {isAudio ? (
            <Waveform className="text-muted-foreground h-4 w-4" />
          ) : (
            <File className="text-muted-foreground h-4 w-4" />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground h-6 w-6"
            >
              <DotsThree className="h-4 w-4" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit?.(note.id)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete?.(note.id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="bg-background rounded-lg px-3 py-3">
        <h3 className="text-md text-foreground line-clamp-1 font-medium">
          {note.title}
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {format(note.addedDate, "d MMM")}
        </p>
      </div>
    </div>
  );
}
