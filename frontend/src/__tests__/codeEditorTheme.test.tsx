import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import CodeEditor from "../components/CodeEditor";

/**
 * `oneDark` used to be an unconditional extension, so every editor stayed dark
 * on the light theme.
 *
 * CodeMirror names its theme classes with generated StyleModule ids (`ͼ3`), so
 * there is nothing readable to assert against. These compare the class list to
 * itself across a theme round trip instead: unconditional `oneDark` would make
 * the light and dark lists identical, which is exactly the regression.
 */

function setTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
}

function classesOf(container: HTMLElement): string {
  return container.querySelector(".cm-editor")?.className ?? "";
}

afterEach(() => document.documentElement.removeAttribute("data-theme"));

describe("CodeEditor theme", () => {
  it("follows the app theme, and swaps it on the same editor", async () => {
    setTheme("dark");
    const { container } = render(<CodeEditor value="APP_ENV=production" onChange={() => {}} />);
    const editor = container.querySelector(".cm-editor");
    const darkClasses = classesOf(container);

    await act(async () => setTheme("light"));
    await vi.waitFor(() => expect(classesOf(container)).not.toBe(darkClasses));

    // Same DOM node: the theme goes through a Compartment, so the document,
    // the cursor and the undo history survive the switch.
    expect(container.querySelector(".cm-editor")).toBe(editor);

    await act(async () => setTheme("dark"));
    await vi.waitFor(() => expect(classesOf(container)).toBe(darkClasses));
  });

  it("keeps the editor usable in both themes", async () => {
    setTheme("light");
    const { container } = render(<CodeEditor value="APP_ENV=production" onChange={() => {}} />);
    expect(container.querySelector(".cm-content")?.textContent).toContain("APP_ENV=production");

    await act(async () => setTheme("dark"));
    await vi.waitFor(() =>
      expect(container.querySelector(".cm-content")?.textContent).toContain("APP_ENV=production"),
    );
  });
});
