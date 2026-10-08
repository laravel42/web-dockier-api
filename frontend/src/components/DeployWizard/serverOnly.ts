import type { RepoAnalysis } from "./types";

/**
 * Runtimes that always need a server process and can never be served as static
 * files. Mirrors the backend's authoritative gate (`getStaticDeployBlockReason`
 * blocks `php` / `python` / `go`).
 */
const SERVER_RUNTIMES = new Set(["php", "python", "go", "ruby", "java", "dotnet", "rust"]);

/**
 * Frameworks that are server-side by nature. Only used as a fallback signal
 * when `staticCapable` is absent; a non-exhaustive safety net, not the primary
 * decision.
 */
const SERVER_FRAMEWORKS = ["laravel", "symfony", "django", "rails", "payload"];

/**
 * Decide whether a project is CONFIDENTLY server-only, from a repo analysis.
 *
 * The primary signal is `staticCapable === false` (the backend's single source
 * of truth). But that field is ABSENT on any analysis cached before the field
 * existed — and the frontend session cache and backend analysis cache are full
 * of such entries. So when `staticCapable` is undefined we fall back to the
 * runtime/framework the cached analysis already carries: a PHP/Python/Go
 * runtime, or a known server framework, is server-only regardless.
 *
 * Returns `true` only when we are CONFIDENT. A genuinely unknown stack (no
 * `staticCapable`, no server runtime, no server framework) returns `false`, so
 * both deploy targets stay available — we never hide Static on mere uncertainty.
 */
export function isServerOnly(analysis: RepoAnalysis | null | undefined): boolean {
  if (!analysis) return false;

  // Primary signal: the backend said so explicitly.
  if (analysis.staticCapable === false) return true;
  // Explicitly capable — never treat as server-only, even if a heuristic below
  // might have matched.
  if (analysis.staticCapable === true) return false;

  // Fallback for analyses cached before `staticCapable` existed.
  const runtime = analysis.aiAnalysis?.runtime?.toLowerCase().trim();
  if (runtime && SERVER_RUNTIMES.has(runtime)) return true;

  const framework = analysis.aiAnalysis?.framework?.toLowerCase() ?? "";
  if (SERVER_FRAMEWORKS.some((f) => framework.includes(f))) return true;

  return false;
}
