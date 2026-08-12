"use client";

import { useEffect, useMemo, useState } from "react";

import { AddFileModal } from "@/components/projects/AddFileModal";
import { FilesTable } from "@/components/projects/FilesTable";
import { RecentFileCard } from "@/components/projects/RecentFileCard";
import type { ProjectFile, User } from "@/lib/data/project-details";

type AssetsFilesTabProps = {
  files: ProjectFile[];
  currentUser?: User;
};

const defaultUser: User = {
  id: "alex-m",
  name: "AlexM",
};

export function AssetsFilesTab({
  files,
  currentUser = defaultUser,
}: AssetsFilesTabProps) {
  const [items, setItems] = useState<ProjectFile[]>(files);
  const [isAddOpen, setIsAddOpen] = useState(false);

  useEffect(() => {
    setItems(files);
  }, [files]);

  const recentFiles = useMemo(() => items.slice(0, 6), [items]);

  const handleAddFile = () => {
    setIsAddOpen(true);
  };

  const handleCreateFiles = (newFiles: ProjectFile[]) => {
    setItems((prev) => [...newFiles, ...prev]);
    setIsAddOpen(false);
  };

  const handleEditFile = (fileId: string) => {
    console.log("Edit file:", fileId);
  };

  const handleDeleteFile = (fileId: string) => {
    console.log("Delete file:", fileId);
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-accent-foreground mb-4 text-sm font-semibold">
          Recent Files
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recentFiles.map((file) => (
            <RecentFileCard
              key={file.id}
              file={file}
              onEdit={handleEditFile}
              onDelete={handleDeleteFile}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-accent-foreground mb-4 text-sm font-semibold">
          All files
        </h2>
        <FilesTable files={items} onAddFile={handleAddFile} />
      </section>

      <AddFileModal
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        currentUser={currentUser}
        onCreate={handleCreateFiles}
      />
    </div>
  );
}
