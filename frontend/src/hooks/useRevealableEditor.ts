import { useEffect, useState } from "react";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSaveAction } from "@/hooks/useSaveAction";

interface RevealableApi {
  /** Fetch masked content on mount */
  getMasked: () => Promise<{ content: string; exists: boolean }>;
  /** Fetch fully decrypted content */
  reveal: () => Promise<{ content: string; exists: boolean }>;
  /** Persist the updated content */
  save: (content: string) => Promise<unknown>;
}

interface UseRevealableEditorOptions {
  /** Error message shown when reveal fails */
  revealErrorMessage?: string;
  /** Error message shown when save fails */
  saveErrorMessage?: string;
}

/**
 * Shared state machine for "load masked → reveal → edit → save" editor flows.
 *
 * Used by EnvironmentSection and WordPressSection — both follow the identical
 * pattern of showing a blurred editor until the user clicks "Reveal", then
 * allowing edits with a save/reset toolbar.
 */
export function useRevealableEditor(
  api: RevealableApi,
  deps: readonly unknown[] = [],
  options: UseRevealableEditorOptions = {},
) {
  const {
    revealErrorMessage = "Failed to reveal content",
    saveErrorMessage = "Failed to save",
  } = options;

  const toast = useToast();

  const { data, loading } = useAsyncData(api.getMasked, deps);

  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [revealed, setRevealed] = useState(false);

  // Sync fetched data into editable state when it loads
  useEffect(() => {
    if (data?.exists || data?.content) {
      setContent(data.content);
      setOriginalContent(data.content);
    }
  }, [data]);

  const handleReveal = async () => {
    try {
      const res = await api.reveal();
      setContent(res.content);
      setOriginalContent(res.content);
      setRevealed(true);
    } catch (err) {
      toast.error(getErrorMessage(err, revealErrorMessage));
    }
  };

  const { saving, saved, save } = useSaveAction(
    async () => {
      await api.save(content);
      setOriginalContent(content);
    },
    { errorFallback: saveErrorMessage },
  );

  const hasChanges = revealed && content !== originalContent;

  const reset = () => setContent(originalContent);

  return {
    content,
    setContent,
    loading,
    revealed,
    hasChanges,
    saving,
    saved,
    handleReveal,
    handleSave: save,
    reset,
  };
}
