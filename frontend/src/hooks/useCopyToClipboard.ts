import { useCallback, useEffect, useRef, useState } from "react";

/** How long a copy stays acknowledged before the button reverts. */
const RESET_MS = 2000;

/**
 * Copy text and acknowledge it — the "Copy → Copied! → Copy" button cycle.
 *
 * Five surfaces each carried their own copy of this with 1500ms/2000ms
 * timeouts, and two left the promise unhandled: `navigator.clipboard` rejects
 * on a denied permission or a non-secure context, which logged an unhandled
 * rejection and left the button stuck on "Copy".
 *
 * `copied` holds the key of the last copied field — the text itself unless a
 * key is given — so one hook can serve several buttons in the same component.
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(async (text: string, key: string = text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Permission denied or insecure context: the value stays selectable.
      return;
    }
    setCopied(key);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(null), RESET_MS);
  }, []);

  return { copied, copy };
}
