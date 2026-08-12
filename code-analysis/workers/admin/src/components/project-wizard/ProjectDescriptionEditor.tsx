import "@/styles/tiptap.css";

import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React, { useEffect, useRef, useState } from "react";

import {
  ArrowsOutSimple,
  Plus,
  StarFour,
} from "@/components/icons/lucide-icons";
import { cn } from "@/lib/utils";

type TemplateType =
  | "goal"
  | "scope"
  | "inScope"
  | "outScope"
  | "outcomes"
  | "feature";

interface ProjectDescriptionEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  onExpandChange?: (isExpanded: boolean) => void;
  onFocusChange?: (isFocused: boolean) => void;
  placeholder?: string;
  className?: string;
  showTemplates?: boolean;
}

export function ProjectDescriptionEditor({
  value,
  onChange,
  onExpandChange,
  onFocusChange,
  placeholder,
  className,
  showTemplates = true,
}: ProjectDescriptionEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [existingSections, setExistingSections] = useState({
    goal: false,
    scope: false,
    outScope: false,
    outcomes: false,
    feature: false,
  });

  useEffect(() => {
    onFocusChange?.(isFocused);
  }, [isFocused, onFocusChange]);

  useEffect(() => {
    onExpandChange?.(isExpanded);
  }, [isExpanded, onExpandChange]);

  const defaultPlaceholder =
    placeholder ?? "Briefly describe the goal of this project/sprint...";

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: ({ node }: { node: { type: { name: string } } }) => {
          if (node.type.name === "heading") {
            return "What's the title?";
          }
          return defaultPlaceholder;
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "tiptap-editor h-full w-full outline-none prose prose-sm max-w-none text-foreground",
      },
    },
    content: value,
    immediatelyRender: false,
    onFocus: () => setIsFocused(true),
    onUpdate: ({ editor }: { editor: Editor }) => {
      const text = editor.getText();
      setExistingSections({
        goal: text.includes("Goal:"),
        scope: text.includes("Scope:"),
        outScope: text.includes("Out of Scope:"),
        outcomes: text.includes("Expected Outcomes:"),
        feature: text.includes("Key feature:"),
      });
      onChange?.(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value == null) return;
    const currentHtml = editor.getHTML();
    if (currentHtml === value) return;
    editor.commands.setContent(value);
  }, [value, editor]);

  // Handle click outside to reset focus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    if (isFocused) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFocused]);

  const handleInsertTemplate = (type: TemplateType) => {
    if (!editor) return;

    switch (type) {
      case "goal":
        editor
          .chain()
          .focus()
          .insertContent(
            "<p><strong>Goal:</strong></p><p>Write the primary goal here...</p>",
          )
          .run();
        break;
      case "scope":
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Scope:",
                },
              ],
            },
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "In scope item 1",
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "In scope item 2",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ])
          .run();
        break;
      case "inScope":
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Scope:",
                },
              ],
            },
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "In scope item" }],
                    },
                  ],
                },
              ],
            },
          ])
          .run();
        break;
      case "outScope":
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Out of Scope:",
                },
              ],
            },
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [{ type: "paragraph", content: [] }],
                },
              ],
            },
          ])
          .run();
        break;
      case "outcomes":
        editor
          .chain()
          .focus()
          .insertContent(
            "<p><strong>Expected Outcomes:</strong></p><ol><li><p></p></li></ol>",
          )
          .run();
        break;
      case "feature":
        editor
          .chain()
          .focus()
          .insertContent(
            "<p><strong>Key feature:</strong></p><ul><li><p></p></li></ul>",
          )
          .run();
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-lg transition-all duration-300 ease-in-out",
        isExpanded
          ? "min-h-0 flex-1"
          : isFocused
            ? "h-70 shrink-0"
            : "h-30 shrink-0",
        className,
      )}
    >
      {(isFocused || isExpanded) && (
        <div className="border-primary pointer-events-none absolute inset-0 z-20 rounded-lg border border-solid" />
      )}

      <div
        className={cn(
          "relative flex size-full flex-col transition-colors",
          isFocused || isExpanded
            ? "bg-background gap-1 p-3.5"
            : "bg-muted/10 hover:bg-muted/20 cursor-text rounded-lg",
        )}
        onClick={() => {
          if (!isFocused) {
            setIsFocused(true);
            editor?.commands.focus();
          }
        }}
      >
        <div
          className={cn(
            "relative flex w-full grow overflow-y-auto",
            isFocused || isExpanded ? "items-start" : "h-full items-center",
          )}
        >
          <div className="h-full w-full">
            <EditorContent editor={editor} className="h-full" />
          </div>

          {(isFocused || isExpanded) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className="absolute top-0 right-0 z-30 p-2 opacity-50 transition-opacity hover:opacity-100"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              <ArrowsOutSimple className="text-muted-foreground size-4" />
            </button>
          )}
        </div>

        {(isFocused || isExpanded) && (
          <div className="animate-in fade-in zoom-in-95 w-full shrink-0 overflow-hidden duration-200">
            <div className="bg-border my-2 h-px w-full" />
            <div className="flex w-full flex-wrap items-center gap-2">
              {showTemplates && (
                <>
                  {!existingSections.goal && (
                    <button
                      type="button"
                      onClick={() => handleInsertTemplate("goal")}
                      className="hover:bg-muted/50 flex items-center gap-1.5 rounded px-2 py-1 opacity-60 transition-all hover:opacity-100"
                    >
                      <Plus className="text-muted-foreground size-3.5" />
                      <span className="text-foreground text-xs font-medium">
                        Goal
                      </span>
                    </button>
                  )}

                  {!existingSections.scope && (
                    <button
                      type="button"
                      onClick={() => handleInsertTemplate("scope")}
                      className="hover:bg-muted/50 flex items-center gap-1.5 rounded px-2 py-1 opacity-60 transition-all hover:opacity-100"
                    >
                      <Plus className="text-muted-foreground size-3.5" />
                      <span className="text-foreground text-xs font-medium">
                        Scope
                      </span>
                    </button>
                  )}

                  {!existingSections.scope && (
                    <button
                      type="button"
                      onClick={() => handleInsertTemplate("inScope")}
                      className="hover:bg-muted/50 flex items-center gap-1.5 rounded px-2 py-1 opacity-60 transition-all hover:opacity-100"
                    >
                      <Plus className="text-muted-foreground size-3.5" />
                      <span className="text-foreground text-xs font-medium">
                        In scope
                      </span>
                    </button>
                  )}

                  {!existingSections.outcomes && (
                    <button
                      type="button"
                      onClick={() => handleInsertTemplate("outcomes")}
                      className="hover:bg-muted/50 flex items-center gap-1.5 rounded px-2 py-1 opacity-60 transition-all hover:opacity-100"
                    >
                      <Plus className="text-muted-foreground size-3.5" />
                      <span className="text-foreground text-xs font-medium">
                        Outcomes
                      </span>
                    </button>
                  )}

                  {!existingSections.outScope && (
                    <button
                      type="button"
                      onClick={() => handleInsertTemplate("outScope")}
                      className="hover:bg-muted/50 flex items-center gap-1.5 rounded px-2 py-1 opacity-60 transition-all hover:opacity-100"
                    >
                      <Plus className="text-muted-foreground size-3.5" />
                      <span className="text-foreground text-xs font-medium">
                        Out of scope
                      </span>
                    </button>
                  )}

                  {!existingSections.feature && (
                    <button
                      type="button"
                      onClick={() => handleInsertTemplate("feature")}
                      className="hover:bg-muted/50 flex items-center gap-1.5 rounded px-2 py-1 opacity-60 transition-all hover:opacity-100"
                    >
                      <Plus className="text-muted-foreground size-3.5" />
                      <span className="text-foreground text-xs font-medium">
                        Key feature
                      </span>
                    </button>
                  )}
                </>
              )}

              <div className="flex-1" />

              <div className="ml-2 flex flex-col items-center justify-center">
                <button
                  type="button"
                  className="bg-muted-foreground/8 hover:bg-muted-foreground/20 flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 py-0.5 transition-colors"
                >
                  <div className="size-3.5">
                    <StarFour weight="fill" className="text-primary size-3.5" />
                  </div>
                  <span className="text-foreground text-xs font-medium tracking-wide">
                    Write with AI
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
