import { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState, Compartment } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

// ─── Language modes ────────────────────────────────────────────────

/** Minimal .env / properties language definition */
const envLang = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/\s*#/)) { stream.skipToEnd(); return "comment"; }
    if (stream.sol() && stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) return "variableName";
    if (stream.eat("=")) return "operator";
    stream.next();
    return "string";
  },
});

/** Minimal shell/bash language definition */
const shellLang = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/\s*#/)) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/\$\{[^}]*\}/) || stream.match(/\$[A-Za-z_][A-Za-z0-9_]*/)) return "variableName";
    if (stream.match(/"[^"]*"/) || stream.match(/'[^']*'/)) return "string";
    if (stream.sol() && stream.match(/[a-z_][a-z0-9_-]*/i)) return "keyword";
    if (stream.match(/&&|\|\||[|;]/)) return "operator";
    stream.next();
    return null;
  },
});

const LANGUAGES = { env: envLang, shell: shellLang } as const;
type EditorLanguage = keyof typeof LANGUAGES;

// ─── Component ─────────────────────────────────────────────────────

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
  language?: EditorLanguage;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, height = "140px", placeholder, language = "env", readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const heightCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        LANGUAGES[language],
        oneDark,
        heightCompartment.current.of(
          EditorView.theme({
            "&": {
              height,
              fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
            },
            ".cm-scroller": { overflow: "auto" },
          }),
        ),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
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
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: heightCompartment.current.reconfigure(
        EditorView.theme({
          "&": {
            height,
            fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
          },
          ".cm-scroller": { overflow: "auto" },
        }),
      ),
    });
  }, [height]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return <div ref={containerRef} className="rounded-lg overflow-hidden border border-border" />;
}
