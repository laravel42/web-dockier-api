import { useState, useEffect, useCallback } from "react";
import { tagsApi } from "@/services/tags";
import type { Tag, TagWithCount } from "@/types";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { CheckIcon, CirclePlusIcon, EllipsisVerticalIcon, SearchIcon, XIcon } from "lucide-react";

// ─── Manage Tags Modal ───

function ManageTagsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchTags = useCallback(async () => {
    try {
      const res = await tagsApi.listWithCounts();
      setTags(res.tags);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { setLoading(true); void fetchTags(); }
  }, [open, fetchTags]);

  const handleAdd = async () => {
    if (!newTagName.trim()) return;
    try {
      await tagsApi.create({ name: newTagName.trim() });
      setNewTagName("");
      void fetchTags();
    } catch { /* silent */ }
  };

  const handleDelete = async (tagId: string) => {
    setDeleting(tagId);
    try {
      await tagsApi.delete(tagId);
      setTags(tags.filter((t) => t.id !== tagId));
    } catch { /* silent */ }
    finally { setDeleting(null); setMenuOpenId(null); }
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
      setTags(tags.map((t) => t.id === renamingId ? { ...t, name: renameValue.trim() } : t));
    } catch { /* silent */ }
    finally { setRenamingId(null); setRenameValue(""); }
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
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
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
                            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-border bg-card shadow-lg py-1">
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
                                {deleting === tag.id ? "Deleting…" : "Delete"}
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

// ─── Tag Picker ───

export default function TagPicker({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManage, setShowManage] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [orgTags, projectTags] = await Promise.all([
        tagsApi.list(),
        tagsApi.getProjectTags(projectId),
      ]);
      setAllTags(orgTags.tags);
      setSelectedIds(projectTags.tags.map((t) => t.id));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredTags = allTags.filter(
    (tag) => tag.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id));

  const toggleTag = async (tagId: string) => {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    setSelectedIds(next);
    try {
      await tagsApi.setProjectTags(projectId, next);
    } catch { /* silent */ }
  };

  const removeTag = async (tagId: string) => {
    const next = selectedIds.filter((id) => id !== tagId);
    setSelectedIds(next);
    try {
      await tagsApi.setProjectTags(projectId, next);
    } catch { /* silent */ }
  };

  const handleCreateTag = async () => {
    if (!inputValue.trim()) return;
    try {
      const newTag = await tagsApi.create({ name: inputValue.trim() });
      setAllTags([...allTags, newTag]);
      const next = [...selectedIds, newTag.id];
      setSelectedIds(next);
      await tagsApi.setProjectTags(projectId, next);
      setInputValue("");
    } catch { /* silent */ }
  };

  const handleManageDone = () => {
    setShowManage(false);
    void fetchData();
  };

  if (loading) return <span className="text-xs text-text-muted">Loading…</span>;

  return (
    <div className="relative">
      {/* Input area with selected tags */}
      <div
        onClick={() => !disabled && setOpen(true)}
        className={`flex min-h-[34px] w-52 flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs cursor-text transition-colors ${
          open ? "border-primary-500 ring-1 ring-primary-500/30" : "border-border"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded border border-primary-500/40 bg-primary-500/10 px-1.5 py-0.5 text-[11px] font-medium text-primary-400"
          >
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void removeTag(tag.id); }}
                className="text-primary-400 hover:text-primary-300"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          className="flex-1 min-w-[60px] bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
          placeholder={selectedTags.length === 0 ? "Select tags…" : ""}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setInputValue(""); }} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <div className="max-h-48 overflow-y-auto py-1">
              {filteredTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => void toggleTag(tag.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-text hover:bg-card/80 transition-colors"
                >
                  <span>{tag.name}</span>
                  {selectedIds.includes(tag.id) && (
                    <CheckIcon className="size-4 text-primary-500" />
                  )}
                </button>
              ))}
              {filteredTags.length === 0 && inputValue && (
                <button
                  type="button"
                  onClick={() => void handleCreateTag()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary-500 hover:bg-card/80 transition-colors"
                >
                  Create &ldquo;{inputValue}&rdquo;
                </button>
              )}
              {filteredTags.length === 0 && !inputValue && (
                <p className="px-3 py-2 text-xs text-text-muted">No tags yet</p>
              )}
            </div>
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setShowManage(true); }}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-400 transition-colors"
              >
                <CirclePlusIcon className="size-3.5" />
                Manage tags
              </button>
            </div>
          </div>
        </>
      )}

      {/* Manage Tags Modal */}
      <ManageTagsModal open={showManage} onClose={handleManageDone} />
    </div>
  );
}
