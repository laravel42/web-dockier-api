/**
 * Single source of truth for every URL the todo app links to.
 *
 * Standalone install: set `NEXT_PUBLIC_TODO_BASE=""` (or remove this prefix by
 * editing TODO_BASE_DEFAULT) and move the pages out of `app/(todo)/todo/` up
 * to `app/(todo)/` so the folder structure matches the URL prefix.
 *
 * Integrated under the admin dashboard: TODO_BASE_DEFAULT="/todo" keeps the
 * todo app under /todo/* alongside (auth) and (admin) shells.
 */

const TODO_BASE_DEFAULT = "/todo";

/** Routing prefix for every todo page. Read at module load. */
export const TODO_BASE = process.env.NEXT_PUBLIC_TODO_BASE ?? TODO_BASE_DEFAULT;

/** Strip a trailing slash so concatenations stay clean. */
function join(...segments: string[]): string {
  return segments.map((s) => s.replace(/\/+$/, "")).join("");
}

export const todoRoutes = {
  base: TODO_BASE || "/",
  all: TODO_BASE || "/",
  today: join(TODO_BASE, "/today"),
  upcoming: join(TODO_BASE, "/upcoming"),
  important: join(TODO_BASE, "/important"),
  activity: join(TODO_BASE, "/activity"),
  settings: join(TODO_BASE, "/settings"),
  deleted: join(TODO_BASE, "/deleted"),
  notifications: join(TODO_BASE, "/notifications"),
  createTask: join(TODO_BASE, "/tasks/new"),
  task: (id: string) => join(TODO_BASE, `/task/${id}`),
  project: (id: string) => join(TODO_BASE, `/projects/${id}`),
} as const;

/** Build an absolute URL (origin + path) — for clipboard / share links. */
export function todoAbsoluteUrl(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return `${window.location.origin}${pathname}`;
}
