import { format } from "date-fns";

import { File, Waveform } from "@/components/icons/lucide-icons";
import type { ProjectNote } from "@/lib/data/project-details";

type NotesRailSectionProps = {
  notes: ProjectNote[];
};

export function NotesRailSection({ notes }: NotesRailSectionProps) {
  const recentNotes = notes.slice(0, 4);

  return (
    <section className="py-6">
      <div className="pb-5">
        <div className="text-sm font-semibold">Notes</div>
      </div>

      {recentNotes.length ? (
        <div className="space-y-4">
          {recentNotes.map((note) => {
            const Icon = note.noteType === "audio" ? Waveform : File;

            return (
              <div key={note.id} className="flex min-w-0 items-start gap-3">
                <div className="text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">
                      {note.title}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {format(note.addedDate, "d MMM")}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                    {note.content ||
                      note.audioData?.aiSummary ||
                      "No note summary available."}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      )}
    </section>
  );
}
