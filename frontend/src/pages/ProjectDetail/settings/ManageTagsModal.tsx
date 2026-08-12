import { useState } from "react";
import { tagsApi } from "@/services/tags";
import type { TagWithCount } from "@/types";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { useAsyncData } from "@/hooks/useAsyncData";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { EllipsisVerticalIcon, SearchIcon } from "lucide-react";

interface ManageTagsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ManageTagsModal({ open, onClose }: ManageTagsModalProps) {
  const toast = useToast();

  const { data, loading, reload, setData } = useAsyncData(
    () => tagsApi.listWithCounts(),
    [open],
    { enabled: open },
  );

  const tags = data?.tags ?? [];

  const [newTagName, setNewTagName] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleAdd = async () => {
    if (!newTagName.trim()) return;
    try {
      await tagsApi.create({ name: newTagName.trim() });
      setNewTagName("");
      void reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create tag"));
    }
  };

  const handleDelete = async (tagId: string) => {
    setDeleting(tagId);
    try {
      await tagsApi.delete(tagId);
      setData((prev) => prev ? { ...prev, tags: prev.tags.filter((t) => t.id !== tagId) } : prev);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete tag"));
    } finally { setDeleting(null); setMenuOpenId(null); }
  };

  const handleStartRename = (tag: TagWithCount) => {
    setRenamingId(tag.id);
    setRenameValue(tag.name);
    setMenuOpenId(null);
  };

  const handleRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    try {
      await tagsApi.update(renamingId, { name: renameValue.trim() });
      setData((prev) => prev ? { ...prev, tags: prev.tags.map((t) => t.id === renamingId ? { ...t, name: renameValue.trim() } : t) } : prev);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to rename tag"));
    } finally { setRenamingId(null); setRenameValue(""); }
  };

  const filteredTags = tags.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={onClose} title="Manage tags">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-text-muted">Manage tags used across your organization.</p>

        {/* Add tag */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Add tag</label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
              placeholder=""
            />
            <Button
              variant="outline"
              onClick={() => void handleAdd()}
              disabled={!newTagName.trim()}
              className="shrink-0"
            >
              Add tag
            </Button>
          </div>
        </div>

        {/* Tags list */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Tags</label>
          <div className="rounded-lg border border-border">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 transition-colors focus-within:border-primary/60">
              <SearchIcon className="size-4 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
                placeholder="Search"
              />
            </div>

            {/* Tag rows */}
            <div>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="size-4" />
                </div>
              ) : filteredTags.length === 0 ? (
                <p className="px-3 py-4 text-xs text-text-muted text-center">No tags found</p>
              ) : (
                filteredTags.map((tag) => (
                  <div key={tag.id} className="flex items-center justify-between px-3 py-2 border-b border-border/50 last:border-b-0">
                    <div className="flex items-baseline gap-2 flex-1 min-w-0">
                      {renamingId === tag.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename();
                              if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                            }}
                            className="h-7 text-xs flex-1"
                            autoFocus
                          />
                          <Button
                            variant="link"
                            onClick={() => void handleRename()}
                            disabled={!renameValue.trim()}
                            className="text-xs"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => { setRenamingId(null); setRenameValue(""); }}
                            className="text-xs px-0!"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-text">{tag.name}</span>
                          {tag.projectCount > 0 && (
                            <span className="text-xs text-text-muted">
                              {tag.projectCount} {tag.projectCount === 1 ? "project" : "projects"}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Actions menu */}
                    {renamingId !== tag.id && (
                      <div className="relative">
                        <Button
                          variant="ghost"
                          onClick={() => setMenuOpenId(menuOpenId === tag.id ? null : tag.id)}
                          className="px-1!"
                        >
                          <EllipsisVerticalIcon className="size-4" />
                        </Button>
                        {menuOpenId === tag.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-border bg-card shadow-(--shadow-overlay) py-1">
                              <button
                                type="button"
                                onClick={() => handleStartRename(tag)}
                                className="flex w-full items-center px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors"
                              >
                                Rename
                              </button>
                              <div className="my-0.5 border-t border-border/50" />
                              <button
                                type="button"
                                onClick={() => void handleDelete(tag.id)}
                                disabled={deleting === tag.id}
                                className="flex w-full items-center px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors disabled:opacity-50"
                              >
                                {deleting === tag.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Done button */}
        <Button variant="primary" className="w-full mt-4" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
