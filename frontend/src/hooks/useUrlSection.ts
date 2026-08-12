import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Sub-tab selection held in the URL rather than component state, so
 * "Observe → Logs" is an address someone can paste into a ticket.
 *
 * Mirrors the main tab's contract (`?tab=`): an unknown or now-hidden value falls
 * back to the first visible section and the URL is corrected with `replace`, so the
 * back button never walks through states the user cannot see.
 *
 * All sub-tabs share the `section` param. Only one main tab renders at a time, so
 * there is no ambiguity — and a stale value left over from another tab simply fails
 * validation and falls back. Cluster names never enter the URL
 * (docs/delivery/project-detail-ia.md), keeping the route a flat `tab`/`section` pair.
 */
export function useUrlSection<T extends string>(
  keys: readonly T[],
  param = "section",
): [T, (key: T, replace?: boolean) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(param);

  const active = useMemo<T>(() => {
    const match = keys.find((k) => k === raw);
    return match ?? (keys[0] as T);
  }, [raw, keys]);

  const setActive = useCallback(
    (key: T, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(param, key);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams, param],
  );

  // Correct an unusable value in place: a deep link to a section the user cannot
  // see, or one left behind by a different tab.
  useEffect(() => {
    if (keys.length === 0) return;
    if (raw !== null && !keys.some((k) => k === raw)) setActive(keys[0] as T, true);
  }, [raw, keys, setActive]);

  return [active, setActive];
}
