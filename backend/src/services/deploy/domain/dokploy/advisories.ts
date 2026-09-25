/**
 * Deploy advisories — telling the user what Dockier had to fix for them.
 *
 * The pipeline compensates for several common gaps so a project deploys without
 * requiring a repo change: it injects a start command when `package.json` has no
 * `start` script, sets PORT/HOST so a Node server is reachable, defaults PHP
 * extensions, skips migrations when no database exists, and overrides DB_* when
 * Dockier owns a self-hosted database.
 *
 * Those fixes are why a deploy succeeds — but silently papering over them is bad
 * for the user: their repo still has the gap, the next platform (or a local run)
 * will hit it, and they never learn why. So each compensation records an advisory
 * and the pipeline prints a short summary at the end of a SUCCESSFUL deploy:
 * what Dockier did, and what to change in the repo to make it unnecessary.
 *
 * Advisories are informational only. They never fail a deploy and never block.
 */

export interface Advisory {
  /** Stable identifier, useful for dedupe and (later) a UI surface. */
  code: AdvisoryCode;
  /** What Dockier did, in plain language. */
  applied: string;
  /** The repo change that would make the fix unnecessary. Omit when none applies. */
  recommendation?: string;
}

export type AdvisoryCode =
  | "missing-start-script"
  | "injected-port-host"
  | "php-extension-defaults"
  | "migrations-skipped"
  | "database-env-overridden"
  | "domain-port-corrected"
  | "php-version-unsupported-by-railpack"
  | "migrations-not-configured";

export interface AdvisoryCollector {
  add(advisory: Advisory): void;
  list(): Advisory[];
}

/**
 * Create a collector. Deduplicates by `code` so a fix applied in more than one
 * place is reported once.
 */
export function createAdvisoryCollector(): AdvisoryCollector {
  const byCode = new Map<AdvisoryCode, Advisory>();
  return {
    add(advisory: Advisory) {
      if (!byCode.has(advisory.code)) byCode.set(advisory.code, advisory);
    },
    list() {
      return [...byCode.values()];
    },
  };
}

/**
 * Render advisories as deploy-log lines. Returns [] when there's nothing to say,
 * so the caller can skip the section entirely.
 */
export function renderAdvisories(advisories: Advisory[]): string[] {
  if (advisories.length === 0) return [];

  const count = advisories.length;
  const lines: string[] = [
    "",
    "── Notes about your project ─────────────────────────────",
    `Your deployment succeeded. Dockier applied ${count} automatic ${count === 1 ? "adjustment" : "adjustments"} ` +
    "to make it work. These are for your information — you may want to address them in the repository:",
  ];

  advisories.forEach((advisory, index) => {
    lines.push(`  ${index + 1}. ${advisory.applied}`);
    if (advisory.recommendation) {
      lines.push(`     → ${advisory.recommendation}`);
    }
  });

  return lines;
}

// ─── Advisory builders ───────────────────────────────────────────
// Kept here so the wording lives in one place rather than being scattered
// across stages.

export function missingStartScriptAdvisory(startCommand: string, framework?: string): Advisory {
  const label = framework ? `${framework} app` : "app";
  return {
    code: "missing-start-script",
    applied: `Your ${label} has no "start" script in package.json, so Dockier is starting it with "${startCommand}".`,
    recommendation: `Add "start": "${startCommand}" to package.json so the start command lives with your code.`,
  };
}

export function injectedPortHostAdvisory(port: number): Advisory {
  return {
    code: "injected-port-host",
    applied: `Dockier set PORT=${port} and HOST=0.0.0.0 so the server is reachable from the proxy.`,
    recommendation: `Make sure your server listens on process.env.PORT and binds 0.0.0.0 (not localhost), otherwise it is only reachable inside the container.`,
  };
}

export function phpExtensionDefaultsAdvisory(extensions: string[]): Advisory {
  return {
    code: "php-extension-defaults",
    applied: `Dockier installed a default set of PHP extensions (${extensions.join(", ")}) because composer.json does not declare them.`,
    recommendation: `Declare the extensions your app needs in composer.json (e.g. "ext-intl": "*") so builds are reproducible elsewhere.`,
  };
}

export function migrationsSkippedAdvisory(): Advisory {
  return {
    code: "migrations-skipped",
    applied: "No database is configured for this project, so Dockier skipped database migrations at startup to avoid a crash loop.",
    recommendation: "If this app needs a database, add one to the project's services and redeploy so migrations run.",
  };
}

export function databaseEnvOverriddenAdvisory(count: number): Advisory {
  return {
    code: "database-env-overridden",
    applied: `Dockier is managing ${count} self-hosted ${count === 1 ? "service" : "services"} and overrode the matching connection variables (DB_*/REDIS_*) in your environment.`,
    recommendation: "Your own values for those variables are ignored while the service is self-hosted by Dockier. Remove them from your project env to avoid confusion, or switch the service to \"managed\" to use your own credentials.",
  };
}

export function domainPortCorrectedAdvisory(from: number | null, to: number): Advisory {
  return {
    code: "domain-port-corrected",
    applied: `The app's domain was forwarding to port ${from ?? "(unset)"}, which no longer matches the app; Dockier corrected it to ${to}.`,
  };
}

export function migrationsNotConfiguredAdvisory(): Advisory {
  return {
    code: "migrations-not-configured",
    applied: "This build does not run database migrations at container startup, and the project has no migration command configured — so migrations did not run.",
    recommendation: 'Add "php artisan migrate --force" to the project\'s post-deploy commands (Project → Settings → Deployments) so schema changes are applied on each deploy.',
  };
}

export function phpVersionUnsupportedAdvisory(phpVersion: string): Advisory {
  return {
    code: "php-version-unsupported-by-railpack",
    applied: `Your composer.json allows PHP ${phpVersion}, which the default builder (Railpack) cannot install — it supports PHP 8.2 and newer. Dockier built this project with Nixpacks instead.`,
    recommendation: `Raise the PHP constraint in composer.json to "^8.2" or newer (the builder resolves the lowest version your constraint allows). PHP ${phpVersion} is also past its official security-support window.`,
  };
}
