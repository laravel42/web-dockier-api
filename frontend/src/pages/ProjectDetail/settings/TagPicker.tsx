import { useState } from "react";
import { tagsApi } from "@/services/tags";
import type { Tag } from "@/types";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { useAsyncData } from "@/hooks/useAsyncData";
import { CheckIcon, CirclePlusIcon, XIcon } from "lucide-react";
import ManageTagsModal from "./ManageTagsModal";

// ─── Types ───

interface TagData {
  allTags: Tag[];
  selectedIds: string[];
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
  const [showManage, setShowManage] = useState(false);
  const toast = useToast();

  const { data: tagData, loading, reload, setData: setTagData } = useAsyncData<TagData>(
    async () => {
      const [orgTags, projectTags] = await Promise.all([
        tagsApi.list(),
        tagsApi.getProjectTags(projectId),
      ]);
      return {
        allTags: orgTags.tags,
        selectedIds: projectTags.tags.map((t) => t.id),
      };
    },
    [projectId],
  );

  const allTags = tagData?.allTags ?? [];
  const selectedIds = tagData?.selectedIds ?? [];

  const filteredTags = allTags.filter(
    (tag) => tag.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id));

  const updateSelectedIds = (next: string[]) => {
    setTagData((prev) => prev ? { ...prev, selectedIds: next } : prev);
  };

  const toggleTag = async (tagId: string) => {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    updateSelectedIds(next);
    try {
      await tagsApi.setProjectTags(projectId, next);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update tags"));
    }
  };

  const removeTag = async (tagId: string) => {
    const next = selectedIds.filter((id) => id !== tagId);
    updateSelectedIds(next);
    try {
      await tagsApi.setProjectTags(projectId, next);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove tag"));
    }
  };

  const handleCreateTag = async () => {
    if (!inputValue.trim()) return;
    try {
      const newTag = await tagsApi.create({ name: inputValue.trim() });
      setTagData((prev) => prev
        ? { allTags: [...prev.allTags, newTag], selectedIds: [...prev.selectedIds, newTag.id] }
        : { allTags: [newTag], selectedIds: [newTag.id] },
      );
      await tagsApi.setProjectTags(projectId, [...selectedIds, newTag.id]);
      setInputValue("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create tag"));
    }
  };

  const handleManageDone = () => {
    setShowManage(false);
    void reload();
  };

  if (loading) return <span className="text-xs text-text-muted">Loading...</span>;

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
          placeholder={selectedTags.length === 0 ? "Select tags..." : ""}
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
