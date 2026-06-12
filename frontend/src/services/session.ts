/**
 * Central session/token store.
 *
 * Single source of truth for the auth token + userId persisted in
 * localStorage, plus the session-expiry event used to react to 401s.
 * Access the token through these helpers rather than reading
 * `localStorage` directly so storage details live in one place.
 */

const TOKEN_KEY = "token";
const USER_ID_KEY = "userId";

/** Read the current auth token, or null if not signed in. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Read the current userId, or null if not signed in. */
export function getUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

/** Persist the auth token + userId after a successful login. */
export function setSession(token: string, userId: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_ID_KEY, userId);
}

/** Clear all persisted session data (logout or expired session). */
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

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
