import { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
}

export default function YamlEditor({ value, onChange, height = "320px", readOnly = false }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      basicSetup,
      yaml(),
      oneDark,
      EditorView.theme({
        "&": {
          height,
          fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
        },
        ".cm-scroller": { overflow: "auto", scrollbarWidth: "none" },
        ".cm-scroller::-webkit-scrollbar": { display: "none" },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} className="rounded-lg overflow-hidden border border-border" />;
}
