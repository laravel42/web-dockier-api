import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  enabled?: boolean;
  /** True while a load-more request is in flight — prevents duplicate fetches. */
  isLoading?: boolean;
  rootMargin?: string;
}

function getScrollParent(node: Element): Element | null {
  let el: Element | null = node.parentElement;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      if (el.scrollHeight > el.clientHeight) return el;
    }
    el = el.parentElement;
  }
  return null;
}

function isNearScrollRoot(node: Element, root: Element | null, rootMarginPx: number): boolean {
  const nodeRect = node.getBoundingClientRect();
  if (!root) {
    return nodeRect.top <= window.innerHeight + rootMarginPx && nodeRect.bottom >= -rootMarginPx;
  }
  const rootRect = root.getBoundingClientRect();
  return nodeRect.top <= rootRect.bottom + rootMarginPx && nodeRect.bottom >= rootRect.top - rootMarginPx;
}

/**
 * Infinite scroll hook using IntersectionObserver.
 *
 * Attach the returned `sentinelRef` to a div at the bottom of your list.
 * When the sentinel scrolls into view, `onLoadMore` is called automatically.
 * Handles scroll containers, prevents duplicate fetches, and re-checks
 * visibility after each page load in case the sentinel is still in view.
 *
 * @param onLoadMore - Callback to trigger the next page load
 * @param options.enabled - Whether infinite scroll is active (default: true)
 * @param options.isLoading - Pass true while fetching to prevent double-triggers
 * @param options.rootMargin - IntersectionObserver margin (default: "200px")
 * @returns sentinelRef — callback ref to attach to the sentinel element
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  { enabled = true, isLoading = false, rootMargin = "200px" }: Options = {},
) {
  const onLoadMoreRef = useRef(onLoadMore);
  const pendingRef = useRef(false);
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);

  const rootMarginPx = (() => {
    const match = rootMargin.match(/^(-?\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : 200;
  })();

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!isLoading) pendingRef.current = false;
  }, [isLoading]);

  const tryLoadMore = useCallback(() => {
    if (!enabled || isLoading || pendingRef.current) return;
    pendingRef.current = true;
    onLoadMoreRef.current();
  }, [enabled, isLoading]);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node);
  }, []);

  useEffect(() => {
    if (!enabled || !sentinelNode) return;

    const root = getScrollParent(sentinelNode);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          tryLoadMore();
        }
      },
      { root, rootMargin },
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [enabled, rootMargin, sentinelNode, tryLoadMore]);

  // After a page finishes loading, the sentinel may still be in view without a new intersection event.
  useEffect(() => {
    if (!enabled || isLoading || !sentinelNode) return;
    const root = getScrollParent(sentinelNode);
    const id = requestAnimationFrame(() => {
      if (isNearScrollRoot(sentinelNode, root, rootMarginPx)) {
        tryLoadMore();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [enabled, isLoading, sentinelNode, rootMarginPx, tryLoadMore]);

  return sentinelRef;
}
