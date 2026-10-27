import { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { useIsDarkMode } from "../hooks/useIsDarkMode";
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
/** Minimal PHP language definition, enough for wp-config.php */
const phpLang = StreamLanguage.define({
  token(stream) {
    // Comments
    if (stream.match("//") || stream.match("#")) { stream.skipToEnd(); return "comment"; }
    if (stream.match("/*")) {
      while (!stream.match("*/") && !stream.eol()) stream.next();
      return "comment";
    }
    if (stream.sol() && stream.match(/\s*\*/)) { stream.skipToEnd(); return "comment"; }
    // PHP open/close tags
    if (stream.match("<?php") || stream.match("?>")) return "meta";
    // Strings
    if (stream.match(/'[^']*'/)) return "string";
    if (stream.match(/"[^"]*"/)) return "string";
    // Variables
    if (stream.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/)) return "variableName";
    // Keywords/built-ins
    if (stream.match(/\b(define|require_once|require|include_once|include|if|else|true|false|null)\b/)) return "keyword";
    if (stream.match(/\b(defined|__DIR__|__FILE__)\b/)) return "atom";
    // Numbers
    if (stream.match(/\b\d+\b/)) return "number";
    // Operators
    if (stream.eat("=") || stream.eat("!") || stream.eat(".")) return "operator";
    // Parentheses, semicolons
    if (stream.eat("(") || stream.eat(")") || stream.eat(";")) return "punctuation";
    stream.next();
    return null;
  },
});
const SANS_STACK = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO_STACK = '"JetBrains Mono", "Fira Code", "Space Grotesk", ui-monospace, monospace';
interface LanguageSpec {
  parser: Extension;
  fontFamily: string;
  fontSize?: string;
}
/**
 * Parser plus type scale per language. `php` carries a mono stack because the
 * wp-config editor arrived as its own component with that scale; keeping it
 * here avoids restyling the .env and shell editors to merge them.
 */
const LANGUAGES: Record<"env" | "shell" | "php", LanguageSpec> = {
  env: { parser: envLang, fontFamily: SANS_STACK },
  shell: { parser: shellLang, fontFamily: SANS_STACK },
  php: { parser: phpLang, fontFamily: MONO_STACK, fontSize: "13px" },
};
type EditorLanguage = keyof typeof LANGUAGES;
function editorTheme(language: EditorLanguage, height: string): Extension {
  const spec = LANGUAGES[language];
  return EditorView.theme({
    "&": {
      height,
      fontFamily: spec.fontFamily,
      ...(spec.fontSize ? { fontSize: spec.fontSize } : {}),
    },
    ".cm-scroller": { overflow: "auto" },
  });
}
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
  const themeCompartment = useRef(new Compartment());
  // `oneDark` used to be unconditional, so the editor stayed dark on the light
  // theme. Dropping it falls back to basicSetup's own light highlighting.
  const dark = useIsDarkMode();
  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        LANGUAGES[language].parser,
        themeCompartment.current.of(dark ? oneDark : []),
        heightCompartment.current.of(editorTheme(language, height)),
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
      effects: heightCompartment.current.reconfigure(editorTheme(language, height)),
    });
  }, [height, language]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(dark ? oneDark : []),
    });
  }, [dark]);
  return <div ref={containerRef} className="rounded-lg overflow-hidden border border-border" />;
}
