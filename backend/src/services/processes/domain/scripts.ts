/**
 * Shell scripts for background processes and cron jobs, run inside the user's
 * container through `executeCommand` (which adds its own quoting layer).
 *
 * The user's command itself is deliberately not filtered — running anything in
 * their own container is the feature. These builders only make sure that command
 * reaches `sh` as ONE literal argument, and that Dockier can find what it started.
 *
 * Shared by start/stop/install/pause and by the post-deploy restore, which used to
 * carry its own copy of this logic with different (and wrong) quoting.
 */

/** POSIX single-quoting: the value reaches the shell as one literal word. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shortHex(id: string): string {
  return id.replace(/[^a-f0-9]/g, "").slice(0, 8);
}

// ─── Background processes ──────────────────────────────────────────

/** At most this many copies of one process, whatever is stored. */
export const MAX_PROCESS_INSTANCES = 10;

export function processTag(processId: string): string {
  return `DOCKIER_PROC_${shortHex(processId)}`;
}

/**
 * Stop every instance of a process: kill each recorded process GROUP, then
 * remove its pid file.
 *
 * Tracking by pid file replaces a `pkill -f` on an environment-variable marker,
 * which never matched (pkill -f reads the command line, not the environment), so
 * Stop reported success and left the process running, and Restart added copies.
 *
 * The second loop stops instances started by older code, which ran the command
 * as `sh -c 'export TAG=1 && …'`: the wrapper's children first (the user's
 * command), then the wrapper. The bracket keeps the pattern from matching this
 * script's own command line, which contains it.
 */
/**
 * Longest graceful-shutdown wait honoured. Stop runs inside an HTTP request the
 * browser abandons after 30 s, and Restart adds a start (two SSH round-trips) on top.
 */
export const MAX_GRACEFUL_SHUTDOWN_SECONDS = 20;

export function stopProcessScript(processId: string, graceSeconds = 0): string {
  const tag = processTag(processId);
  const legacyPattern = `export ${tag.slice(0, 13)}[${tag[13]}]${tag.slice(14)}=1`;
  const grace = Math.min(Math.max(Math.trunc(graceSeconds) || 0, 0), MAX_GRACEFUL_SHUTDOWN_SECONDS);
  return [
    `P=""`,
    `for f in /tmp/${tag}_*.pid; do`,
    `  [ -f "$f" ] || continue`,
    `  p=$(cat "$f")`,
    // Negative pid = the whole group: the command and anything it spawned.
    `  kill -TERM -"$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null`,
    `  P="$P $p"`,
    `  rm -f "$f"`,
    `done`,
    // Graceful shutdown: give the groups up to `grace` seconds to exit on TERM
    // (a queue worker finishes its current job), then SIGKILL whatever is left.
    `i=0`,
    `while [ -n "$P" ] && [ "$i" -lt ${grace} ]; do`,
    `  A=""; for p in $P; do { kill -0 -"$p" 2>/dev/null || kill -0 "$p" 2>/dev/null; } && A="$A $p"; done`,
    `  P="$A"; [ -n "$P" ] && sleep 1; i=$((i + 1))`,
    `done`,
    `for p in $P; do kill -KILL -"$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null; done`,
    `for p in $(pgrep -f ${shQuote(legacyPattern)} 2>/dev/null); do`,
    `  pkill -TERM -P "$p" 2>/dev/null`,
    `  kill -TERM "$p" 2>/dev/null`,
    `done`,
    `echo STOPPED`,
  ].join("\n");
}

/**
 * Start `count` instances, after stopping any already running so a start can
 * never leave duplicates behind.
 *
 * Each instance is `sh -c '<command>'` so `;`, `&&` and pipes stay one unit, run
 * under `setsid` so it leads its own process group for Stop to kill.
 * shortcut: without setsid (a minimal image), Stop kills only the top process, so
 * children of a compound command survive; install util-linux/busybox if that bites.
 */
export function startProcessScript(
  processId: string,
  command: string,
  count: number,
  opts: { workingDirectory?: string | null; graceSeconds?: number } = {},
): string {
  const tag = processTag(processId);
  const n = Math.min(Math.max(count || 1, 1), MAX_PROCESS_INSTANCES);
  const lines = [stopProcessScript(processId, opts.graceSeconds)];
  const dir = opts.workingDirectory?.trim();
  if (dir) {
    // Fail the start with a readable reason rather than run the command somewhere else.
    lines.push(`cd ${shQuote(dir)} || { echo ${shQuote(`Working directory not found: ${dir}`)}; exit 1; }`);
  }
  lines.push(`S=""; command -v setsid >/dev/null 2>&1 && S=setsid`);
  for (let i = 0; i < n; i++) {
    lines.push(
      `$S nohup sh -c ${shQuote(command)} > /tmp/${tag}_${i}.log 2>&1 < /dev/null & echo $! > /tmp/${tag}_${i}.pid`,
    );
  }
  lines.push("sleep 1", "echo STARTED");
  return lines.join("\n");
}

export function processLogsScript(processId: string, lines: number): string {
  const tag = processTag(processId);
  return `cat /tmp/${tag}_*.log 2>/dev/null | tail -n ${Math.trunc(lines)} || echo "No logs available yet."`;
}

// ─── Cron jobs ─────────────────────────────────────────────────────

export const FREQUENCY_TO_CRON: Record<string, string> = {
  every_minute: "* * * * *",
  hourly: "0 * * * *",
  nightly: "0 0 * * *",
  weekly: "0 0 * * 0",
  monthly: "0 0 1 * *",
  on_reboot: "@reboot",
};

const CRON_MACROS = new Set(["@reboot", "@yearly", "@annually", "@monthly", "@weekly", "@daily", "@midnight", "@hourly"]);
const CRON_FIELD = /^[0-9A-Za-z*/,-]+$/;

/**
 * Five crontab fields (numbers, ranges, steps, lists, names) or one @-macro.
 * Six was accepted before, but cron has no seconds field: the sixth token became
 * part of the command, and an hour field such as 30 made `crontab` refuse the file.
 */
export function isValidCronExpression(expr: string): boolean {
  const trimmed = expr.trim();
  if (CRON_MACROS.has(trimmed)) return true;
  const fields = trimmed.split(/\s+/);
  return fields.length === 5 && fields.every((f) => CRON_FIELD.test(f));
}

/** A Unix user name; interpolated into `crontab -u`. */
export const SAFE_CRON_USER = /^[a-z_][a-z0-9_-]{0,31}$/;

export function cronTag(jobId: string): string {
  return `DOCKIER_JOB_${shortHex(jobId)}`;
}

/**
 * One crontab line per job, its tag at the end. `#` after the command is a shell
 * comment, so cron ignores it; a crontab `%` means "newline", so a literal one in
 * the user's shell command is escaped.
 */
export function cronLine(expr: string, command: string, jobId: string): string {
  const cronSafe = command.replace(/(?<!\\)%/g, "\\%");
  return `${expr} ${cronSafe} # ${cronTag(jobId)}`;
}

/**
 * Drop this job's entry from a crontab on stdin. Removal used to be
 * `grep -v "# ↑ dockier"`, which matched EVERY Dockier job: installing, pausing
 * or deleting one job silently uninstalled all the others. Also removes the old
 * two-line form (a `# TAG` line followed by `… # ↑ dockier`) for this job only.
 */
export function cronRemoveFilter(jobId: string): string {
  const program = `skip { skip=0; if (index($0, "# ↑ dockier")) next } index($0, t) { if ($0 ~ /^# /) skip=1; next } { print }`;
  return `awk -v t=${shQuote(cronTag(jobId))} ${shQuote(program)}`;
}

/** Install (or reinstall) one job's crontab entry. `user` must match SAFE_CRON_USER. */
export function installCronScript(params: { jobId: string; user: string; expr: string; command: string }): string {
  const { jobId, user, expr, command } = params;
  const tmp = `/tmp/cron_edit_${cronTag(jobId)}`;
  return [
    "which crontab > /dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq cron > /dev/null 2>&1)",
    `(crontab -u ${user} -l 2>/dev/null || true) | ${cronRemoveFilter(jobId)} > ${tmp}`,
    `printf '%s\\n' ${shQuote(cronLine(expr, command, jobId))} >> ${tmp}`,
    `crontab -u ${user} ${tmp}`,
    `rm -f ${tmp}`,
    "(service cron start 2>/dev/null || crond 2>/dev/null || true)",
    "echo INSTALLED",
  ].join(" && ");
}

export function removeCronScript(params: { jobId: string; user: string }): string {
  const { jobId, user } = params;
  const tmp = `/tmp/cron_edit_${cronTag(jobId)}`;
  return [
    `(crontab -u ${user} -l 2>/dev/null || true) | ${cronRemoveFilter(jobId)} > ${tmp}`,
    `crontab -u ${user} ${tmp}`,
    `rm -f ${tmp}`,
    "echo PAUSED",
  ].join(" && ");
}
