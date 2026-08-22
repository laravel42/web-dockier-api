import { useCallback, useEffect, useState, type ReactNode } from "react";
import { sastApi } from "@/services/api";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { SettingsField } from "@/components/SettingsField";
import { Input } from "@/components/ui/input";
import Button from "@/components/ui/Button";
import PageLoading from "@/components/ui/PageLoading";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import TechBadge from "@/components/TechBadge";
import { TriangleAlertIcon, InfoIcon, PlusIcon, XIcon } from "lucide-react";
import { segmentActiveCls, segmentIdleCls, typeSectionHeading } from "@/utils/styles";
import type {
  BearerSettings, CodeQLLanguage, CodeQLSettings, CodeQLSuite, EngineSettings, RegexSettings,
  SemgrepSettings,
} from "@/types/sast";

/**
 * Configuration for the engines that run in the standalone SAST service.
 *
 * These read and write the SAST service directly (`VITE_SAST_API_BASE`), not the
 * Fastify gateway — the settings belong to the service that acts on them. When
 * that base is not configured the panels say so plainly rather than showing
 * controls that cannot save.
 */

/**
 * Vite reads .env once at startup, so a variable added to a running dev server
 * is absent until it restarts. That produced a confusing failure — the panel
 * called the Fastify gateway, got a 404, and reported the service unreachable —
 * so the unconfigured case is now named separately from the unreachable one.
 */
const SAST_BASE = import.meta.env.VITE_SAST_API_BASE as string | undefined;
const CONFIGURED = Boolean(SAST_BASE);

const LANGUAGES: Array<{ id: CodeQLLanguage; label: string; icon: string }> = [
  { id: "python", label: "Python", icon: "python" },
  { id: "javascript", label: "JavaScript / TypeScript", icon: "typescript" },
  { id: "go", label: "Go", icon: "go" },
  { id: "ruby", label: "Ruby", icon: "ruby" },
  { id: "java", label: "Java", icon: "java" },
  { id: "csharp", label: "C#", icon: "csharp" },
  { id: "cpp", label: "C / C++", icon: "cplusplus" },
];

const SUITES: Array<{ id: CodeQLSuite; label: string; note: string }> = [
  { id: "security-and-quality", label: "Security and quality", note: "Security plus maintainability. The default." },
  { id: "security-extended", label: "Security extended", note: "More security queries, more false positives." },
  { id: "code-scanning", label: "Code scanning", note: "The smaller set GitHub runs by default." },
];

function useEngineSettings() {
  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [loading, setLoading] = useState(CONFIGURED);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CONFIGURED) { setLoading(false); return; }
    const ac = new AbortController();
    let done = false;
    sastApi
      .getSettings(ac.signal)
      .then((s) => { done = true; setSettings(s); setLoading(false); })
      .catch((e) => {
        // An abort is not an outcome. StrictMode mounts, cleans up and mounts
        // again in development, so the first request is always aborted; ending
        // the loading state there left settings null with no error, and the
        // panel rendered nothing at all.
        if (ac.signal.aborted) return;
        done = true;
        setError(getErrorMessage(e));
        setLoading(false);
      });
    return () => { if (!done) ac.abort(); };
  }, []);

  return { settings, setSettings, loading, error };
}

/** No base configured — a different problem from the service being down. */
function NotConfigured() {
  return (
    <div className="flex gap-3 rounded-card border border-border bg-card p-4">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-text">Bearer and CodeQL run in a separate service.</p>
        <p className="mt-1 text-text-muted">
          Set <code className="rounded bg-background px-1 py-0.5 text-xs">VITE_SAST_API_BASE</code>{" "}
          to that service&rsquo;s router — for example{" "}
          <code className="rounded bg-background px-1 py-0.5 text-xs">http://127.0.0.1:8000</code> —
          then restart the dev server. Vite reads the env file once at startup, so adding the
          variable to a running server has no effect until it is restarted.
        </p>
      </div>
    </div>
  );
}

/** Configured, but the call failed — the panels cannot invent a state. */
function Unreachable({ message }: { message: string }) {
  return (
    <div className="flex gap-3 rounded-card border border-warning-500/40 bg-warning-500/5 p-4">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-text">The SAST service did not respond.</p>
        <p className="mt-1 text-text-muted">{message}</p>
        <p className="mt-2 text-text-muted">
          Configured base:{" "}
          <code className="rounded bg-card px-1 py-0.5 text-xs">{SAST_BASE}</code>. Check that the
          service is running there.
        </p>
      </div>
    </div>
  );
}

/** Glob list editor, shared by every engine that accepts extra excludes. */
function ExcludeList({
  globs, onChange,
}: { globs: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const g = draft.trim();
    if (!g || globs.includes(g)) return;
    onChange([...globs, g]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {globs.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {globs.map((g) => (
            <li
              key={g}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs"
            >
              <code>{g}</code>
              <button
                type="button"
                aria-label={`Remove exclusion ${g}`}
                onClick={() => onChange(globs.filter((x) => x !== g))}
                className="text-text-muted hover:text-danger-500"
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="**/fixtures/**"
          spellCheck={false}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button variant="secondary" disabled={!draft.trim() || globs.includes(draft.trim())} onClick={add}>
          <PlusIcon className="size-4" aria-hidden /> Add
        </Button>
      </div>
    </div>
  );
}

function SaveRow({ saving, dirty, onSave }: { saving: boolean; dirty: boolean; onSave: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {dirty && !saving && <span className="text-xs text-text-muted">Unsaved changes</span>}
      <Button onClick={onSave} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return m === 1 ? "1 minute" : `${m} minutes`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

function EnginePanelShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-(--shadow-card)">
      <div className="border-b border-border px-5 py-4">
        <h3 className={typeSectionHeading}>{title}</h3>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p>
        <p className="mt-2 text-xs text-text-muted">
          Turn this engine on or off in <span className="font-medium text-text-secondary">Security Tools</span> above.
        </p>
      </div>
      <div className="space-y-8 p-5">
        {children}
      </div>
      {footer && (
        <div className="border-t border-border bg-background/40 px-5 py-4">
          {footer}
        </div>
      )}
    </div>
  );
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h4 className="text-xs font-medium uppercase tracking-wider text-text-muted">{title}</h4>
      {description ? (
        <p className="mt-1.5 mb-4 max-w-prose text-sm text-text-muted">{description}</p>
      ) : (
        <div className="mb-4" aria-hidden />
      )}
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function DurationField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (seconds: number) => void;
}) {
  return (
    <SettingsField id={id} label={label}>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="max-w-36 tabular-nums"
        />
        <span className="text-sm text-text-muted">{formatDuration(value)}</span>
      </div>
      <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
    </SettingsField>
  );
}

const BEARER_SEVERITIES = ["critical", "high", "medium", "low", "warning"] as const;

function parseSeverities(raw: string): Set<string> {
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function serializeSeverities(active: Set<string>): string {
  return BEARER_SEVERITIES.filter((s) => active.has(s)).join(",");
}

function SeverityPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const active = parseSeverities(value);

  const toggle = (sev: (typeof BEARER_SEVERITIES)[number]) => {
    const next = new Set(active);
    if (next.has(sev)) {
      next.delete(sev);
      if (next.size === 0) next.add(sev);
    } else {
      next.add(sev);
    }
    onChange(serializeSeverities(next));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {BEARER_SEVERITIES.map((sev) => {
          const on = active.has(sev);
          return (
            <button
              key={sev}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(sev)}
              className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                on ? segmentActiveCls : segmentIdleCls
              }`}
            >
              {sev}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          className="font-medium text-primary hover:text-primary/80"
          onClick={() => onChange(BEARER_SEVERITIES.join(","))}
        >
          All severities
        </button>
        <button
          type="button"
          className="font-medium text-primary hover:text-primary/80"
          onClick={() => onChange("critical,high,medium")}
        >
          High and above
        </button>
      </div>
    </div>
  );
}

const CODEQL_BUILD_MODES: Array<{
  id: CodeQLSettings["buildMode"];
  label: string;
  note: string;
}> = [
  { id: "none", label: "No build", note: "Database without compiling — right for most repos." },
  { id: "autobuild", label: "Auto-build", note: "Compile first; slower, needed for some Java and C++ projects." },
];

// ─── Bearer ───

const BEARER_SCANNERS: Array<{ id: "sast" | "secrets"; label: string; note: string }> = [
  { id: "sast", label: "SAST", note: "Static analysis rules from Bearer’s built-in rule set." },
  { id: "secrets", label: "Secrets", note: "Hard-coded credentials, API keys, and similar leaks." },
];

export function BearerSettingsPanel() {
  const { settings, setSettings, loading, error } = useEngineSettings();
  const [form, setForm] = useState<BearerSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { if (settings) setForm(settings.bearer); }, [settings]);

  const dirty = !!form && !!settings && JSON.stringify(form) !== JSON.stringify(settings.bearer);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await sastApi.saveSettings("bearer", form);
      setSettings((prev) => (prev ? { ...prev, bearer: form } : prev));
      toast.success("Bearer settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, setSettings, toast]);

  if (!CONFIGURED) return <NotConfigured />;
  if (loading) return <PageLoading />;
  if (error) return <Unreachable message={error} />;
  if (!form) return null;

  const set = <K extends keyof BearerSettings>(k: K, v: BearerSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const toggleScanner = (id: "sast" | "secrets") => {
    const next = form.scanners.includes(id)
      ? form.scanners.filter((s) => s !== id)
      : [...form.scanners, id];
    set("scanners", next.length > 0 ? next : [id === "sast" ? "secrets" : "sast"]);
  };

  return (
    <EnginePanelShell
      title="Bearer"
      description="Static analysis and secret detection via the Bearer CLI on each repository checkout."
      footer={<SaveRow saving={saving} dirty={dirty} onSave={save} />}
    >
      <SettingsGroup title="What to scan" description="Choose which Bearer scanners run and how findings are filtered.">
        <SettingsField label="Scanners">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {BEARER_SCANNERS.map(({ id, label, note }) => (
              <div key={id} className="flex items-start justify-between gap-4 bg-background/20 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{label}</p>
                  <p className="mt-0.5 text-sm text-text-muted">{note}</p>
                </div>
                <ToggleSwitch
                  checked={form.scanners.includes(id)}
                  onChange={() => toggleScanner(id)}
                  ariaLabel={`Enable Bearer ${label}`}
                />
              </div>
            ))}
          </div>
        </SettingsField>

        <SettingsField label="Minimum severity">
          <SeverityPicker value={form.severities} onChange={(v) => set("severities", v)} />
          <p className="mt-1.5 text-xs text-text-muted">
            Only findings at or above a selected level are reported.
          </p>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Scope" description="Narrow what Bearer walks; built-in excludes always apply.">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background/20 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Skip test directories</p>
            <p className="mt-0.5 text-sm text-text-muted">
              Ignores common test and fixture paths to reduce noise.
            </p>
          </div>
          <ToggleSwitch
            checked={form.skipTest}
            onChange={(v) => set("skipTest", v)}
            ariaLabel="Skip test directories"
          />
        </div>

        <SettingsField label="Additional skip paths">
          <ExcludeList globs={form.skipPaths} onChange={(v) => set("skipPaths", v)} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Limits">
        <DurationField
          id="bearer-timeout"
          label="Scan timeout"
          hint="Bearer is aborted after this duration so a stuck scan cannot block the pipeline."
          value={form.timeoutSeconds}
          min={60}
          max={7200}
          onChange={(v) => set("timeoutSeconds", v)}
        />
      </SettingsGroup>
    </EnginePanelShell>
  );
}

// ─── CodeQL ───

export function CodeQLSettingsPanel() {
  const { settings, setSettings, loading, error } = useEngineSettings();
  const [form, setForm] = useState<CodeQLSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { if (settings) setForm(settings.codeql); }, [settings]);

  const dirty = !!form && !!settings && JSON.stringify(form) !== JSON.stringify(settings.codeql);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await sastApi.saveSettings("codeql", form);
      setSettings((prev) => (prev ? { ...prev, codeql: form } : prev));
      toast.success("CodeQL settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, setSettings, toast]);

  if (!CONFIGURED) return <NotConfigured />;
  if (loading) return <PageLoading />;
  if (error) return <Unreachable message={error} />;
  if (!form) return null;

  const set = <K extends keyof CodeQLSettings>(k: K, v: CodeQLSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const toggleLang = (id: CodeQLLanguage) =>
    set(
      "languages",
      form.languages.includes(id)
        ? form.languages.filter((l) => l !== id)
        : [...form.languages, id],
    );

  const allLanguageIds = LANGUAGES.map((l) => l.id);

  return (
    <EnginePanelShell
      title="CodeQL"
      description="Builds a query database per language, then runs a security query suite. Thorough and slow — large repos can take tens of minutes per language."
      footer={<SaveRow saving={saving} dirty={dirty} onSave={save} />}
    >
      <SettingsGroup
        title="Languages"
        description="Narrows analysis to selected languages. Languages not present in the repo are skipped automatically."
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-muted">
            {form.languages.length} of {LANGUAGES.length} selected
          </span>
          <div className="flex gap-3 text-xs font-medium">
            <button
              type="button"
              className="text-primary hover:text-primary/80"
              onClick={() => set("languages", [...allLanguageIds])}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-primary hover:text-primary/80"
              onClick={() => set("languages", [])}
            >
              Clear
            </button>
          </div>
        </div>
        <ul className="flex flex-wrap gap-2">
          {LANGUAGES.map(({ id, label, icon }) => {
            const on = form.languages.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggleLang(id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    on ? segmentActiveCls : segmentIdleCls
                  }`}
                >
                  <TechBadge name={label} icon={icon} iconOnly iconSize="w-4 h-4" />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
        {form.languages.length === 0 && (
          <p className="text-sm text-warning-500" role="status">
            No languages selected — CodeQL will not report findings.
          </p>
        )}
      </SettingsGroup>

      <SettingsGroup title="Analysis" description="Query depth and how databases are built.">
        <SettingsField label="Query suite">
          <div className="space-y-2">
            {SUITES.map(({ id, label, note }) => {
              const selected = form.querySuite === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set("querySuite", id)}
                  className={`flex w-full cursor-pointer gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selected ? segmentActiveCls : segmentIdleCls
                  }`}
                >
                  <span
                    className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${
                      selected ? "border-primary bg-primary" : "border-border bg-card"
                    }`}
                    aria-hidden
                  />
                  <span className="text-sm">
                    <span className="font-medium text-text">{label}</span>
                    <span className="mt-0.5 block text-text-muted">{note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsField>

        <SettingsField label="Build mode">
          <div className="grid gap-2 sm:grid-cols-2">
            {CODEQL_BUILD_MODES.map(({ id, label, note }) => {
              const selected = form.buildMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set("buildMode", id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selected ? segmentActiveCls : segmentIdleCls
                  }`}
                >
                  <span className="block text-sm font-medium text-text">{label}</span>
                  <span className="mt-0.5 block text-sm text-text-muted">{note}</span>
                </button>
              );
            })}
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Limits">
        <DurationField
          id="codeql-timeout"
          label="Timeout per language"
          hint="Building and analysing one database stops after this duration."
          value={form.timeoutSeconds}
          min={60}
          max={21600}
          onChange={(v) => set("timeoutSeconds", v)}
        />
      </SettingsGroup>
    </EnginePanelShell>
  );
}


// ─── Semgrep ───

export function SemgrepSettingsPanel() {
  const { settings, loading, error } = useEngineSettings();
  const [form, setForm] = useState<SemgrepSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { if (settings) setForm(settings.semgrep); }, [settings]);
  const dirty = !!form && !!settings && JSON.stringify(form) !== JSON.stringify(settings.semgrep);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await sastApi.saveSettings("semgrep", form);
      toast.success("Semgrep settings saved");
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setSaving(false); }
  }, [form, toast]);

  if (!CONFIGURED) return <NotConfigured />;
  if (loading) return <PageLoading />;
  if (error) return <Unreachable message={error} />;
  if (!form) return null;

  const set = <K extends keyof SemgrepSettings>(k: K, v: SemgrepSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Semgrep</h3>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Runs the repository&rsquo;s Opengrep rule corpus. The rules themselves are managed under{" "}
            <em>Semgrep Rules</em>; these are the limits the scan runs under.
          </p>
        </div>
        <ToggleSwitch checked={form.enabled} onChange={(v) => set("enabled", v)} ariaLabel="Enable Semgrep" />
      </div>

      <SettingsField label="Per-rule timeout">
        <Input
          type="number" min={5} max={600} className="max-w-40"
          value={form.ruleTimeoutSeconds}
          onChange={(e) => set("ruleTimeoutSeconds", Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          Seconds one rule may spend on one file. A pathological rule/file pair can otherwise hang a
          whole scan.
        </p>
      </SettingsField>

      <SettingsField label="Whole-scan timeout">
        <Input
          type="number" min={60} max={21600} className="max-w-40"
          value={form.scanTimeoutSeconds}
          onChange={(e) => set("scanTimeoutSeconds", Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          Seconds before the engine gives up on a repository entirely.
        </p>
      </SettingsField>

      <SettingsField label="Maximum file size">
        <Input
          type="number" min={10000} max={50000000} className="max-w-52"
          value={form.maxTargetBytes}
          onChange={(e) => set("maxTargetBytes", Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          Bytes. Files above this are skipped — a finding on line 2 of a minified bundle is not
          actionable.
        </p>
      </SettingsField>

      <SettingsField label="Additional excludes">
        <ExcludeList globs={form.extraExcludes} onChange={(v) => set("extraExcludes", v)} />
        <p className="mt-1.5 text-xs text-text-muted">
          Added to the built-in dependency and build-output globs, never instead of them.
        </p>
      </SettingsField>

      <SaveRow saving={saving} dirty={dirty} onSave={save} />
    </div>
  );
}

// ─── Custom rules and sensitive data ───

export function CustomRulesSettingsPanel() {
  const { settings, loading, error } = useEngineSettings();
  const [form, setForm] = useState<RegexSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { if (settings) setForm(settings.regex); }, [settings]);
  const dirty = !!form && !!settings && JSON.stringify(form) !== JSON.stringify(settings.regex);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await sastApi.saveSettings("regex", form);
      toast.success("Custom rules settings saved");
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setSaving(false); }
  }, [form, toast]);

  if (!CONFIGURED) return <NotConfigured />;
  if (loading) return <PageLoading />;
  if (error) return <Unreachable message={error} />;
  if (!form) return null;

  const set = <K extends keyof RegexSettings>(k: K, v: RegexSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Custom rules and sensitive data</h3>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Two pattern scanners that share one pass over the tree: your regex rules, and field
            classification across SQL migrations and model files. Neither costs AI credits.
          </p>
        </div>
        <ToggleSwitch checked={form.enabled} onChange={(v) => set("enabled", v)} ariaLabel="Enable custom rules engine" />
      </div>

      <div className="divide-y divide-border rounded-card border border-border">
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-text">Custom regex rules</p>
            <p className="mt-1 max-w-prose text-sm text-text-muted">
              The rules managed under <em>Custom Rules</em>, stored per organization.
            </p>
          </div>
          <ToggleSwitch checked={form.customRules} onChange={(v) => set("customRules", v)} ariaLabel="Run custom regex rules" />
        </div>
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-text">Sensitive data classification</p>
            <p className="mt-1 max-w-prose text-sm text-text-muted">
              Classifies fields as personal, sensitive or secret. Hashed passwords are deliberately
              not flagged — flagging them trains people to ignore the scanner.
            </p>
          </div>
          <ToggleSwitch checked={form.sensitiveData} onChange={(v) => set("sensitiveData", v)} ariaLabel="Run sensitive data classification" />
        </div>
      </div>

      <SettingsField label="Maximum file size">
        <Input
          type="number" min={10000} max={50000000} className="max-w-52"
          value={form.maxFileBytes}
          onChange={(e) => set("maxFileBytes", Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-text-muted">Bytes. Larger files are not read.</p>
      </SettingsField>

      <SettingsField label="Additional excludes">
        <ExcludeList globs={form.extraExcludes} onChange={(v) => set("extraExcludes", v)} />
        <p className="mt-1.5 text-xs text-text-muted">
          Narrows the walk further; it never widens what is scanned.
        </p>
      </SettingsField>

      <SaveRow saving={saving} dirty={dirty} onSave={save} />
    </div>
  );
}
