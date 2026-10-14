import type { RepoConfig } from "./types.js";

export function cleanVersion(v: string): string {
  if (!v) return "";
  return v.replace(/^[\^~>=<]+/, "").split(" ")[0];
}

/**
 * Static-capability signals for a framework that can render either way.
 *
 * `buildsStatic` — the DEFAULT build already produces static output, so the app
 * is static (drives `static-export` ⇄ `ssr`, `kind`, the Dockerfile template).
 * `canGenerateStatic` — a static build is AVAILABLE if the user picks the static
 * deploy target (e.g. a `nuxt generate` script next to an SSR `nuxt build`).
 * Only the static deploy gate reads it; the default build path is unaffected.
 */
export interface StaticSignals {
  buildsStatic: boolean;
  canGenerateStatic: boolean;
}

// shortcut: config text is matched, not evaluated — a computed ssr/output value
// (ssr: isProd, output: process.env.X) is not detected; upgrade to parsing the
// AST if a real repo is misread.

/**
 * Nuxt: `ssr: false` / `nitro.preset: "static"` build static; a generate script
 * can — unless the repo contradicts it.
 *
 * The generate script alone is weak evidence: `nuxi init` scaffolds
 * `"generate": "nuxt generate"`, so nearly every Nuxt 3 repo carries it,
 * including SSR apps whose `server/api` routes a static build would drop. So it
 * is rejected when there is positive counter-evidence — a `server/api`
 * directory, or an explicitly non-static nitro preset. `ssr: false` and
 * `nitro.preset: "static"` stay sufficient on their own: those are deliberate
 * author choices, and a stray `server/` dir does not override them.
 */
export function nuxtStaticSignals(configText: string, scriptsText: string, hasServerApi = false): StaticSignals {
  const buildsStatic =
    /nitro\s*:\s*\{[^}]*preset\s*:\s*['"]static['"]/.test(configText)
    || /ssr\s*:\s*false/.test(configText)
    || /preset\s*:\s*['"]static['"]/.test(configText);
  if (buildsStatic) return { buildsStatic, canGenerateStatic: true };

  const preset = /preset\s*:\s*['"]([^'"]+)['"]/.exec(configText);
  const nonStaticPreset = preset !== null && preset[1] !== "static";
  const hasGenerateScript =
    /\b(nuxt|nuxi)\s+generate\b/.test(scriptsText)
    || /NITRO_PRESET\s*=\s*['"]?static\b/.test(scriptsText);
  return {
    buildsStatic: false,
    canGenerateStatic: hasGenerateScript && !hasServerApi && !nonStaticPreset,
  };
}

/**
 * Next.js: only `output: "export"` is a static signal.
 *
 * A `next export` script is NOT accepted: the command was removed in Next 14,
 * and the Next major cannot be read reliably from committed text, so the signal
 * would offer static hosting for a build that cannot produce it.
 */
export function nextStaticSignals(configText: string): StaticSignals {
  const buildsStatic = /output\s*:\s*['"]export['"]/.test(configText);
  return { buildsStatic, canGenerateStatic: buildsStatic };
}

/** Apply framework-specific Node.js minimums after engines/.nvmrc detection. */
export function finalizeNodeVersion(config: RepoConfig): void {
  if (config.runtime !== "node") return;

  let ver = parseInt(config.nodeVersion || config.runtimeVersion || "20", 10);
  if (Number.isNaN(ver)) ver = 20;

  let minVer = 18;

  if (config.framework === "nextjs") {
    // Modern Next.js SSR stacks (Payload, undici 7+, etc.) fail on Node 18.
    minVer = Math.max(minVer, 20);
  } else if (config.framework === "nuxt" && config.features.has("ssr")) {
    minVer = Math.max(minVer, 20);
  } else if (config.features.has("payload")) {
    minVer = Math.max(minVer, 20);
  }

  if (ver < minVer) {
    config.nodeVersion = String(minVer);
    config.runtimeVersion = String(minVer);
  } else if (!config.nodeVersion) {
    config.nodeVersion = String(ver);
    config.runtimeVersion = String(ver);
  }
}

export function configSummary(config: RepoConfig): string[] {
  const lines: string[] = [];
  lines.push(`Runtime: ${config.runtime} ${config.runtimeVersion}`);
  if (config.framework) lines.push(`Framework: ${config.framework} ${config.frameworkVersion}`);
  lines.push(`Package manager: ${config.packageManager}${config.packageManagerVersion ? ` v${config.packageManagerVersion}` : ""}`);
  if (config.subDir) lines.push(`App directory: ${config.subDir}/`);
  if (config.nodeVersion) lines.push(`Node.js version: ${config.nodeVersion}`);
  if (config.phpVersion) lines.push(`PHP version: ${config.phpVersion}`);
  if (config.phpExtensions.length > 0) lines.push(`PHP extensions: ${config.phpExtensions.join(", ")}`);
  if (config.nativeDeps.length > 0) lines.push(`Native deps: ${config.nativeDeps.map(d => `${d.name} (${d.reason})`).join(", ")}`);
  if (config.hasStandalone) lines.push("Next.js standalone output: yes");
  if (config.features.size > 0) lines.push(`Features: ${[...config.features].join(", ")}`);
  return lines;
}
