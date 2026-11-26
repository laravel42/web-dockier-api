/*
  Built feature-by-feature through CrepeBuilder rather than `new Crepe(...)`.
  Crepe's barrel entry statically imports every feature, so `Latex: false` turned
  the feature off at runtime while katex (588 kB, the largest module in the
  bundle) still shipped. The barrel also pulls @codemirror/language-data, which
  is where @vue/runtime-core came from in a React app.

  The feature list below is exactly the set that was enabled before, so this is
  a bundling change, not a behaviour one. `useEditor` accepts a CrepeBuilder:
  see GetEditor in @milkdown/react's types.
*/
import { languages } from "@codemirror/language-data";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { cursor } from "@milkdown/crepe/feature/cursor";
import { imageBlock } from "@milkdown/crepe/feature/image-block";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { table } from "@milkdown/crepe/feature/table";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
/* Crepe theme first, then our overrides — load order is what kills the
   ProseMirror padding: 60px 120px that made top spacing flicker. Both sheets
   live here so Vite emits them with this async chunk instead of the
   render-blocking entry stylesheet. */
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-viewer.css";

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
    // Added, not disabled: toolbar, top bar, block edit, placeholder, AI and
    // latex are simply absent, so their code never enters the bundle.
    const crepe = new CrepeBuilder({ root, defaultValue: markdown });
    crepe.addFeature(codeMirror, { languages });
    crepe.addFeature(cursor);
    crepe.addFeature(imageBlock);
    crepe.addFeature(linkTooltip);
    crepe.addFeature(listItem);
    crepe.addFeature(table);
    crepe.setReadonly(true);
    return crepe;
  }, []);

  return <Milkdown />;
}

export default function MarkdownViewerCrepe({ markdown, className = "" }: Props) {
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
