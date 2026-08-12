import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * Exists so ARIA can follow a responsive layout: a tablist rendered as a sidebar
 * on desktop and a scrolling strip on mobile must announce the orientation it
 * actually has, not the one it has most of the time.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind's `md` breakpoint — the width at which stacked layouts become side-by-side. */
export function useIsMdUp(): boolean {
  return useMediaQuery("(min-width: 48rem)");
}
