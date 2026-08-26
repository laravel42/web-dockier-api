import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";

interface Props {
  markdown: string;
  className?: string;
}

/** Drop leading blank lines so Crepe doesn't emit an empty first <p>. */
function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/^\s+/, "");
}

/**
 * Read-only Milkdown (Crepe) surface for rendering markdown as WYSIWYG prose.
 * Remounts when `markdown` changes so the editor always mirrors the source.
 */
function MilkdownReadonly({ markdown }: { markdown: string }) {
  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: markdown,
      features: {
        // Viewer only — strip chrome meant for editing.
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Placeholder]: false,
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.Latex]: false,
      },
    });
    crepe.setReadonly(true);
    return crepe;
  }, []);

  return <Milkdown />;
}

export default function MarkdownViewer({ markdown, className = "" }: Props) {
  const source = normalizeMarkdown(markdown);

  return (
    <div className={`milkdown-viewer ${className}`.trim()}>
      {/*
        Key remounts the provider when the source changes — Crepe has no
        lightweight "replace markdown" path that avoids a full recreate.
      */}
      <MilkdownProvider key={source}>
        <MilkdownReadonly markdown={source} />
      </MilkdownProvider>
    </div>
  );
}
