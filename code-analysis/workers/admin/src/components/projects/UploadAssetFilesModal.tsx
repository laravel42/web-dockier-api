"use client";

import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useRef } from "react";

import { UploadSimple } from "@/components/icons/lucide-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UploadAssetFilesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesSelect: (files: File[]) => void;
};

export function UploadAssetFilesModal({
  open,
  onOpenChange,
  onFilesSelect,
}: UploadAssetFilesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      onFilesSelect(files);
      onOpenChange(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      onFilesSelect(files);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border z-[60] gap-0 rounded-3xl border p-6 shadow-2xl sm:max-w-[600px]">
        <DialogHeader>
          <VisuallyHidden>
            <DialogTitle>Upload Files</DialogTitle>
          </VisuallyHidden>
          <div className="flex items-center gap-2 text-base font-medium">
            <UploadSimple className="h-4 w-4" />
            Upload Files
          </div>
        </DialogHeader>

        <div
          className="border-border hover:border-primary/50 mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <UploadSimple className="text-muted-foreground/50 mb-4 h-10 w-10" />
          <p className="text-foreground text-sm font-medium">
            Drop your files here or click to browse
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            Supports PDF, ZIP, FIG, DOC and more
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
}
