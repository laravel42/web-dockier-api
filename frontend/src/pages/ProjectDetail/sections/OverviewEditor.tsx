import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { AIExtension, AIMenuController } from "@blocknote/xl-ai";
import { en as aiEn } from "@blocknote/xl-ai/locales";
import "@blocknote/xl-ai/style.css";
import type { Project } from "@/types";
import { projectsApi } from "@/services/projects";
import { gitApi } from "@/services/git";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { normalizeOverviewBlocks } from "../utils/normalizeOverviewBlocks";
import {
  getOverviewCacheKey,
  getCachedOverview,
  setCachedOverview,
} from "../utils/overviewContentCache";
import { handleOverviewLinkClick } from "../utils/overviewLinkNavigation";
import OverviewAiMenus from "./OverviewAiMenus";
import { createOverviewAiTransport } from "../utils/overviewAiTransport";

const README_PATHS = ["README.md", "readme.md", "README", "Readme.md"];
const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveStatus = "saving" | "saved" | "error";

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saving: "Saving…",
  saved: "Saved",
  error: "Failed to save",
};

function OverviewSaveToast({ status }: { status: SaveStatus }) {
  const tone =
    status === "saving"
      ? "border-border text-foreground"
      : status === "saved"
        ? "border-success-500 text-success-500"
        : "border-danger-500 text-danger-500";

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-100 flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[11px] font-medium leading-none shadow-(--shadow-card-hover) ${tone}`}
    >
      {status === "saving" && (
        <span className="size-2.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {SAVE_STATUS_LABEL[status]}
    </div>,
    document.body,
  );
}

interface Props {
  project: Project;
  editable: boolean;
  onProjectUpdate: (project: Project) => void;
}

function OverviewSpinner({ label = "Loading overview…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 pb-8 justify-center">
      <div className="size-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

async function fetchReadmeMarkdown(project: Project): Promise<string | null> {
  if (!project.connectionId || !project.repository) return null;
  if (project.sourceType === "template") return null;

  const parsed = parseOwnerRepo(project.repository);
  if (!parsed) return null;

  const branch = project.branch || "main";
  for (const path of README_PATHS) {
    try {
      const { content } = await gitApi.getFileContent(
        project.connectionId,
        parsed.owner,
        parsed.repo,
        branch,
        path,
      );
      if (content.trim()) return content;
    } catch {
      /* try next path */
    }
  }
  return null;
}

function markdownToBlocks(markdown: string): PartialBlock[] {
  const temp = BlockNoteEditor.create();
  return normalizeOverviewBlocks(temp.tryParseMarkdownToBlocks(markdown));
}

export default function OverviewEditor({ project, editable, onProjectUpdate }: Props) {
  const cacheKey = getOverviewCacheKey(project);
  const cachedOnMount = getCachedOverview(cacheKey);
  const savedOnMount = project.config?.overviewBlocks;

  const [initialContent, setInitialContent] = useState<PartialBlock[] | undefined | null>(() => {
    if (savedOnMount && savedOnMount.length > 0) {
      return normalizeOverviewBlocks(savedOnMount as PartialBlock[]);
    }
    if (cachedOnMount) return cachedOnMount.blocks;
    return null;
  });
  const [loadError, setLoadError] = useState<string | null>(() => cachedOnMount?.loadError ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const onProjectUpdateRef = useRef(onProjectUpdate);
  onProjectUpdateRef.current = onProjectUpdate;
  const prevCacheKeyRef = useRef(cacheKey);
  const hasLoadedRef = useRef(initialContent !== null);

  const onOverviewLinkClick = useCallback((event: MouseEvent) => {
    handleOverviewLinkClick(event, overviewRef.current);
    return true;
  }, []);

  const showSaveStatus = useCallback((status: SaveStatus) => {
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    setSaveStatus(status);
    if (status === "saved" || status === "error") {
      saveStatusTimer.current = setTimeout(() => setSaveStatus(null), 5000);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cacheKeyChanged = prevCacheKeyRef.current !== cacheKey;
    prevCacheKeyRef.current = cacheKey;
    if (cacheKeyChanged) {
      hasLoadedRef.current = false;
      setInitialContent(null);
      setLoadError(null);
    } else if (hasLoadedRef.current) {
      return;
    }

    async function load() {
      const saved = project.config?.overviewBlocks;
      if (saved && saved.length > 0) {
        const blocks = normalizeOverviewBlocks(saved as PartialBlock[]);
        setCachedOverview(cacheKey, { blocks, loadError: null });
        if (!cancelled) {
          setInitialContent(blocks);
          setLoadError(null);
          hasLoadedRef.current = true;
        }
        return;
      }

      const cached = getCachedOverview(cacheKey);
      if (cached) {
        if (!cancelled) {
          setInitialContent(cached.blocks);
          setLoadError(cached.loadError);
          hasLoadedRef.current = true;
        }
        return;
      }

      if (!cancelled) {
        setLoadError(null);
        setInitialContent(null);
      }

      const readme = await fetchReadmeMarkdown(project);
      if (cancelled) return;

      if (!readme) {
        const msg = project.sourceType === "template"
          ? "Template projects don't have a linked repository overview. Start writing to add content."
          : "No README.md found in this repository.";
        const entry = { blocks: undefined, loadError: msg };
        setCachedOverview(cacheKey, entry);
        setInitialContent(undefined);
        setLoadError(entry.loadError);
        hasLoadedRef.current = true;
        return;
      }

      const blocks = markdownToBlocks(readme);
      const entry = {
        blocks: blocks.length > 0 ? blocks : undefined,
        loadError: blocks.length === 0 ? "README.md is empty." : null,
      };
      setCachedOverview(cacheKey, entry);
      setInitialContent(entry.blocks);
      setLoadError(entry.loadError);
      hasLoadedRef.current = true;
    }

    void load();

    return () => {
      cancelled = true;
    };
    // Only reload when the project/repo/branch identity changes — not on autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project fields are read from the render that matches cacheKey
  }, [cacheKey]);

  const aiTransport = useMemo(() => (editable ? createOverviewAiTransport() : null), [editable]);

  const editorOptions = useMemo(() => {
    if (initialContent === null || initialContent === undefined) return undefined;

    return {
      initialContent,
      dictionary: {
        ...en,
        ai: aiEn,
      },
      links: {
        HTMLAttributes: {
          target: "_self",
          rel: "noopener noreferrer",
        },
        onClick: onOverviewLinkClick,
      },
      ...(aiTransport
        ? {
            extensions: [
              AIExtension({
                transport: aiTransport,
                agentCursor: { name: "AI", color: "var(--color-primary)" },
              }),
            ],
          }
        : {}),
    };
  }, [initialContent, onOverviewLinkClick, aiTransport]);

  const editor = useCreateBlockNote(editorOptions, [cacheKey, initialContent, editable]);

  editorRef.current = editor;

  useEffect(() => {
    if (initialContent === null || initialContent === undefined) return;

    const handler = (event: MouseEvent) => {
      handleOverviewLinkClick(event, overviewRef.current);
    };

    let editorDom: HTMLElement | null = null;

    const attach = () => {
      editorDom = editor.prosemirrorView?.dom ?? null;
      editorDom?.addEventListener("click", handler, true);
      editorDom?.querySelectorAll("a[href]").forEach((anchor) => {
        anchor.removeAttribute("target");
      });
    };

    const detach = () => {
      editorDom?.removeEventListener("click", handler, true);
      editorDom = null;
    };

    attach();
    const unsubMount = editor.onMount(() => {
      detach();
      attach();
    });

    return () => {
      unsubMount();
      detach();
    };
  }, [editor, initialContent]);

  useEffect(() => {
    if (initialContent === null || initialContent === undefined || !editable) return;

    const unsubChange = editor.onChange(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          showSaveStatus("saving");
          try {
            const blocks = editor.document;
            const updated = await projectsApi.update(project.id, {
              config: { overviewBlocks: blocks as unknown as Record<string, unknown>[] },
            });
            setCachedOverview(cacheKey, { blocks, loadError: null });
            onProjectUpdateRef.current(updated);
            showSaveStatus("saved");
          } catch {
            showSaveStatus("error");
          }
        })();
      }, AUTOSAVE_DEBOUNCE_MS);
    });

    return () => {
      unsubChange();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [cacheKey, editable, editor, initialContent, project.id, showSaveStatus]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    };
  }, []);

  if (initialContent === null) {
    return <OverviewSpinner />;
  }

  if (loadError && !initialContent) {
    return <p className="text-sm text-text-muted pb-6 text-center">{loadError}</p>;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {editable && saveStatus && <OverviewSaveToast status={saveStatus} />}
      <div ref={overviewRef} className="overview-editor min-h-0 flex-1 overflow-y-auto">
        <BlockNoteView
          editor={editor}
          editable={editable}
          formattingToolbar={editable && aiTransport ? false : undefined}
          slashMenu={editable && aiTransport ? false : undefined}
        >
          {editable && aiTransport && (
            <>
              <AIMenuController />
              <OverviewAiMenus editor={editor} />
            </>
          )}
        </BlockNoteView>
      </div>
    </div>
  );
}
