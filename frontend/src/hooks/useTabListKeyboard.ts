import { useCallback, type KeyboardEvent } from "react";

type Orientation = "horizontal" | "vertical" | "both";

export function tabId(key: string): string {
  return `tab-${key}`;
}

export function panelId(key: string): string {
  return `panel-${key}`;
}

export function useTabListKeyboard<T extends string>(
  tabs: readonly T[],
  setTab: (tab: T) => void,
  orientation: Orientation = "horizontal",
) {
  return useCallback(
    (e: KeyboardEvent<HTMLElement>, currentKey: T) => {
      const idx = tabs.indexOf(currentKey);
      if (idx === -1) return;

      // "both" is for tablists whose axis changes with the viewport — a sidebar on
      // desktop, a scrolling strip on mobile. Accepting either axis is a superset
      // of the APG pattern, so neither expectation is ever wrong on screen.
      const prevKeys =
        orientation === "horizontal" ? ["ArrowLeft"]
        : orientation === "vertical" ? ["ArrowUp"]
        : ["ArrowLeft", "ArrowUp"];
      const nextKeys =
        orientation === "horizontal" ? ["ArrowRight"]
        : orientation === "vertical" ? ["ArrowDown"]
        : ["ArrowRight", "ArrowDown"];

      let nextIdx: number | null = null;
      if (prevKeys.includes(e.key)) {
        e.preventDefault();
        nextIdx = idx === 0 ? tabs.length - 1 : idx - 1;
      } else if (nextKeys.includes(e.key)) {
        e.preventDefault();
        nextIdx = idx === tabs.length - 1 ? 0 : idx + 1;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIdx = tabs.length - 1;
      }

      if (nextIdx !== null) {
        const nextTab = tabs[nextIdx]!;
        setTab(nextTab);
        document.getElementById(tabId(nextTab))?.focus();
      }
    },
    [tabs, orientation, setTab],
  );
}
