type SessionExpiredHandler = () => void;

let handler: SessionExpiredHandler | null = null;

/** Register a callback for expired/invalid sessions (401). Returns unsubscribe. */
export function onSessionExpired(fn: SessionExpiredHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function notifySessionExpired(): void {
  handler?.();
}
