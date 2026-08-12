import { useCallback, type KeyboardEvent } from "react";

type Orientation = "horizontal" | "vertical";

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

      const prevKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";

      let nextIdx: number | null = null;
      if (e.key === prevKey) {
        e.preventDefault();
        nextIdx = idx === 0 ? tabs.length - 1 : idx - 1;
      } else if (e.key === nextKey) {
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
