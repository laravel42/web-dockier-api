"use client";

import { format } from "date-fns";
import Image from "next/image";
import { useState } from "react";

import {
  DotsThree,
  MagnifyingGlass,
  Plus,
} from "@/components/icons/lucide-icons";
import { getFileIcon } from "@/components/projects/FileLinkRow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectFile } from "@/lib/data/project-details";

type FilesTableProps = {
  files: ProjectFile[];
  onAddFile?: () => void;
};

export function FilesTable({ files, onAddFile }: FilesTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toggleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map((file) => file.id));
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setSelectedFiles((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search files"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onAddFile}>
          <Plus className="h-4 w-4" />
          Add File
        </Button>
      </div>

      <div className="border-border bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    filteredFiles.length > 0 &&
                    selectedFiles.length === filteredFiles.length &&
                    filteredFiles.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead>Added date</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map((file) => {
              const icon = getFileIcon(file.type);
              const sizeLabel =
                file.isLinkAsset || file.sizeMB === 0
                  ? "Link"
                  : `${file.sizeMB.toFixed(1)} MB`;

              return (
                <TableRow key={file.id} className="cursor-pointer">
                  <TableCell
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Checkbox
                      checked={selectedFiles.includes(file.id)}
                      onCheckedChange={() => toggleSelectFile(file.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg">
                        <Image
                          src={icon.src}
                          alt={icon.alt}
                          width={28}
                          height={28}
                          className="rounded"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-foreground truncate text-sm font-medium">
                          {file.name}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {sizeLabel}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {file.addedBy.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(file.addedDate, "d MMM")}
                  </TableCell>
                  <TableCell
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground h-8 w-8"
                    >
                      <DotsThree className="h-4 w-4" weight="bold" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
