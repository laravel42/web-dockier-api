import Image from "next/image";

import { DownloadSimple } from "@/components/icons/lucide-icons";
import { Button } from "@/components/ui/button";
import type { QuickLink } from "@/lib/data/project-details";
import { cn } from "@/lib/utils";

type FileLinkRowProps = {
  file: QuickLink;
  className?: string;
};

export function getFileIcon(type: QuickLink["type"]) {
  switch (type) {
    case "pdf":
      return { src: "/pdf.png", alt: "PDF" };
    case "zip":
      return { src: "/zip.png", alt: "ZIP" };
    case "fig":
      return { src: "/figma.png", alt: "Figma" };
    default:
      return { src: "/pdf.png", alt: "File" };
  }
}

export function FileLinkRow({ file, className }: FileLinkRowProps) {
  const icon = getFileIcon(file.type);

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center justify-center rounded-lg">
          <Image
            src={icon.src}
            alt={icon.alt}
            width={36}
            height={36}
            className="rounded"
          />
        </div>
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-medium">
            {file.name}
          </div>
          <div className="text-muted-foreground text-sm">
            {file.sizeMB.toFixed(1)} MB
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-xl"
        aria-label={`Download ${file.name}`}
        asChild
      >
        <a href={file.url} target="_blank" rel="noreferrer">
          <DownloadSimple className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}
