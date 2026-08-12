"use client";

import { useEffect, useState } from "react";

import {
  Microphone,
  Paperclip,
  Tag,
  UploadSimple,
  X,
} from "@/components/icons/lucide-icons";
import { ProjectDescriptionEditor } from "@/components/project-wizard/ProjectDescriptionEditor";
import { QuickCreateModalLayout } from "@/components/QuickCreateModalLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/data/project-details";

type CreateNoteModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: User;
  onCreateNote: (title: string, content: string) => void;
  onUploadAudio: () => void;
};

export function CreateNoteModal({
  open,
  onOpenChange,
  currentUser,
  onCreateNote,
  onUploadAudio,
}: CreateNoteModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | undefined>(undefined);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;

    setTitle("");
    setDescription(undefined);
    setIsExpanded(false);
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleCreate = () => {
    onCreateNote(title, description ?? "");
    setTitle("");
    setDescription(undefined);
    onOpenChange(false);
  };

  const handleUploadClick = () => {
    onUploadAudio();
  };

  return (
    <QuickCreateModalLayout
      open={open}
      onClose={handleClose}
      isDescriptionExpanded={isExpanded}
      onSubmitShortcut={handleCreate}
    >
      {/* Title row with close button */}
      <div className="mt-1 flex w-full shrink-0 items-center justify-between gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex h-10 w-full items-center gap-1">
            <input
              id="note-create-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className="text-foreground placeholder:text-muted-foreground w-full border-none bg-transparent p-0 text-xl leading-7 font-normal outline-none"
              autoComplete="off"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8 rounded-full opacity-70 hover:opacity-100"
          onClick={handleClose}
        >
          <X className="text-muted-foreground h-4 w-4" />
        </Button>
      </div>

      {/* Description */}
      <ProjectDescriptionEditor
        value={description}
        onChange={setDescription}
        onExpandChange={setIsExpanded}
        placeholder="Write the details of this note..."
        showTemplates={false}
      />

      {/* Note context (author + tag) */}
      <div className="mt-2 flex items-center gap-2">
        <div className="border-border bg-muted/50 flex items-center gap-2 rounded-full border px-3 py-1.5">
          <Avatar className="h-5 w-5">
            <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
            <AvatarFallback className="text-[10px]">
              {currentUser.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{currentUser.name}</span>
        </div>

        <div className="border-border flex items-center gap-2 rounded-full border px-3 py-1.5">
          <Tag className="text-muted-foreground h-4 w-4" />
          <span className="text-sm">General note</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex w-full shrink-0 items-center justify-between pt-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
          >
            <Microphone className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleUploadClick}>
            <UploadSimple className="h-4 w-4" />
            Upload audio file
          </Button>
          <Button size="sm" onClick={handleCreate}>
            Create Note
          </Button>
        </div>
      </div>
    </QuickCreateModalLayout>
  );
}
