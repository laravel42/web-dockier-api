import { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

// Minimal PHP language definition for wp-config.php
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

interface WpConfigEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
}

export default function WpConfigEditor({ value, onChange, height = "400px" }: WpConfigEditorProps) {
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
        phpLang,
        oneDark,
        EditorView.theme({
          "&": {
            height,
            fontFamily: '"JetBrains Mono", "Fira Code", "Space Grotesk", ui-monospace, monospace',
            fontSize: "13px",
          },
          ".cm-scroller": { overflow: "auto" },
        }),
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
