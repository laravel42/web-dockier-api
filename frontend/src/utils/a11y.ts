import type { KeyboardEvent } from "react";

/**
 * Make a non-semantic container behave like a button for keyboard users.
 *
 * Cards across the app carried a bare `onClick` on a <div>: operable with a mouse,
 * invisible to keyboard and assistive tech (WCAG 2.1.1). Spread this instead.
 * Pass `enabled: false` for a card that is not currently actionable — it then
 * contributes no role and no tab stop.
 */
export function clickableProps(onActivate: () => void, enabled = true) {
  if (!enabled) return {};
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  } as const;
}
