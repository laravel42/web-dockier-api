import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";

/**
 * Keyboard behaviour for a row action menu, per the WAI-ARIA menu pattern.
 *
 * The menus in this app were inconsistent in a way that mattered: some carried
 * `role="menu"` without any of the movement that role promises, others carried no
 * role but behaved like menus, and none closed on Escape. A screen-reader user
 * told "menu" then given no arrow keys is worse off than one told nothing.
 *
 * Attach `menuRef` to the container, spread nothing else — the hook wires the
 * document-level Escape listener itself and exposes `onKeyDown` for the container.
 * Items need only `role="menuitem"`.
 */
export function useMenuKeyboard(open: boolean, onClose: () => void) {
  const menuRef = useRef<HTMLDivElement>(null);

  const items = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    [],
  );

  // Focus the first item on open, so the keyboard user lands inside the menu
  // rather than being left on the trigger with nowhere obvious to go.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => items()[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const list = items();
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement as HTMLElement);

      const focus = (next: number) => {
        e.preventDefault();
        list[(next + list.length) % list.length]?.focus();
      };

      if (e.key === "ArrowDown") focus(idx + 1);
      else if (e.key === "ArrowUp") focus(idx <= 0 ? list.length - 1 : idx - 1);
      else if (e.key === "Home") focus(0);
      else if (e.key === "End") focus(list.length - 1);
      else if (e.key === "Tab") onClose(); // tabbing out dismisses, per the APG
    },
    [items, onClose],
  );

  return { menuRef, onKeyDown };
}
