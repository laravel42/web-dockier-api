import { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

// Minimal .env / properties language definition
const envLang = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/\s*#/)) { stream.skipToEnd(); return "comment"; }
    if (stream.sol() && stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) return "variableName";
    if (stream.eat("=")) return "operator";
    stream.next();
    return "string";
  },
});

interface EnvEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}

export default function EnvEditor({ value, onChange, height = "140px", placeholder }: EnvEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        envLang,
        oneDark,
        EditorView.theme({ "&": { height }, ".cm-scroller": { overflow: "auto" } }),
        ...(placeholder ? [EditorView.contentAttributes.of({ "aria-placeholder": placeholder })] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

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
