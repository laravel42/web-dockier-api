import { useEffect, useRef, useState } from "react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import type { Project } from "@/types";
import { gitApi } from "@/services/git";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { normalizeOverviewBlocks } from "../utils/normalizeOverviewBlocks";
import {
  getOverviewCacheKey,
  getCachedOverview,
  setCachedOverview,
} from "../utils/overviewContentCache";
import { handleOverviewLinkClick } from "../utils/overviewLinkNavigation";
import MarkdownViewer from "@/components/MarkdownViewer";

const README_PATHS = ["README.md", "readme.md", "README", "Readme.md"];

interface Props {
  project: Project;
  /** Kept for call-site compatibility; overview is view-only. */
  editable?: boolean;
  /** Kept for call-site compatibility; overview is view-only. */
  onProjectUpdate?: (project: Project) => void;
  /** Hide overflow instead of scrolling — used when the parent clips with Show all. */
  clipOverflow?: boolean;
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

/** Headless BlockNote — only used to round-trip stored overviewBlocks → markdown. */
function markdownToBlocks(markdown: string): PartialBlock[] {
  const temp = BlockNoteEditor.create();
  return normalizeOverviewBlocks(temp.tryParseMarkdownToBlocks(markdown));
}

function blocksToMarkdown(blocks: PartialBlock[]): string {
  const temp = BlockNoteEditor.create({
    initialContent: blocks.length > 0 ? blocks : undefined,
  });
  return temp.blocksToMarkdownLossy();
}

export default function OverviewEditor({
  project,
  clipOverflow = false,
}: Props) {
  const cacheKey = getOverviewCacheKey(project);
  const cachedOnMount = getCachedOverview(cacheKey);
  const savedOnMount = project.config?.overviewBlocks;

  const [markdown, setMarkdown] = useState<string | null>(() => {
    if (savedOnMount && savedOnMount.length > 0) {
      return blocksToMarkdown(normalizeOverviewBlocks(savedOnMount as PartialBlock[]));
    }
    if (cachedOnMount?.blocks) return blocksToMarkdown(cachedOnMount.blocks);
    if (cachedOnMount && cachedOnMount.loadError) return "";
    return null;
  });
  const [loadError, setLoadError] = useState<string | null>(() => cachedOnMount?.loadError ?? null);

  const overviewRef = useRef<HTMLDivElement>(null);
  const prevCacheKeyRef = useRef(cacheKey);
  const hasLoadedRef = useRef(markdown !== null);

  useEffect(() => {
    let cancelled = false;
    const cacheKeyChanged = prevCacheKeyRef.current !== cacheKey;
    prevCacheKeyRef.current = cacheKey;
    if (cacheKeyChanged) {
      hasLoadedRef.current = false;
      setMarkdown(null);
      setLoadError(null);
    } else if (hasLoadedRef.current) {
      return;
    }

    async function load() {
      const saved = project.config?.overviewBlocks;
      if (saved && saved.length > 0) {
        const blocks = normalizeOverviewBlocks(saved as PartialBlock[]);
        const md = blocksToMarkdown(blocks);
        setCachedOverview(cacheKey, { blocks, loadError: null });
        if (!cancelled) {
          setMarkdown(md);
          setLoadError(null);
          hasLoadedRef.current = true;
        }
        return;
      }

      const cached = getCachedOverview(cacheKey);
      if (cached) {
        if (!cancelled) {
          setMarkdown(cached.blocks ? blocksToMarkdown(cached.blocks) : "");
          setLoadError(cached.loadError);
          hasLoadedRef.current = true;
        }
        return;
      }

      if (!cancelled) {
        setLoadError(null);
        setMarkdown(null);
      }

      const readme = await fetchReadmeMarkdown(project);
      if (cancelled) return;

      if (!readme) {
        const msg =
          project.sourceType === "template"
            ? "Template projects don't have a linked repository overview."
            : "No README.md found in this repository.";
        const entry = { blocks: undefined, loadError: msg };
        setCachedOverview(cacheKey, entry);
        setMarkdown("");
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
      setMarkdown(readme);
      setLoadError(entry.loadError);
      hasLoadedRef.current = true;
    }

    void load();

    return () => {
      cancelled = true;
    };
    // Only reload when the project/repo/branch identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project fields are read from the render that matches cacheKey
  }, [cacheKey]);

  useEffect(() => {
    const root = overviewRef.current;
    if (!root) return;

    const handler = (event: MouseEvent) => {
      handleOverviewLinkClick(event, overviewRef.current);
    };
    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [markdown]);

  if (markdown === null) {
    return <OverviewSpinner />;
  }

  if (loadError && !markdown.trim()) {
    return <p className="text-sm text-text-muted pb-6 text-center">{loadError}</p>;
  }

  const overflowCls = clipOverflow ? "overflow-hidden" : "overflow-y-auto";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={overviewRef}
        className={`overview-editor min-h-0 flex-1 ${overflowCls}`}
      >
        <MarkdownViewer markdown={markdown} />
      </div>
    </div>
  );
}
