"use client";

import { toast } from "sonner";

import { Paperclip, UploadSimple } from "@/components/icons/lucide-icons";
import { FileLinkRow } from "@/components/projects/FileLinkRow";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { QuickLink } from "@/lib/data/project-details";

type QuickLinksCardProps = {
  links: QuickLink[];
};

export function QuickLinksCard({ links }: QuickLinksCardProps) {
  const isEmpty = links.length === 0;

  return (
    <section className="py-6">
      <div className="pb-5">
        <div className="text-sm font-semibold">Quick links</div>
      </div>
      <div>
        {isEmpty ? (
          <div className="border-border/70 rounded-lg border border-dashed p-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Paperclip className="text-muted-foreground h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-foreground font-medium">No files</div>
                <div className="text-muted-foreground mt-1">
                  Upload or attach files for this project.
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    toast.message("Upload file", { description: "Mock action" })
                  }
                >
                  <UploadSimple className="h-4 w-4" />
                  Upload file
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((f, idx) => (
              <div key={f.id}>
                <FileLinkRow file={f} />
                {idx < links.length - 1 ? <Separator className="mt-3" /> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
