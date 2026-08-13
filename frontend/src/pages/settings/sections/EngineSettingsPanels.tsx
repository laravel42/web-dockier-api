import { useCallback, useEffect, useState } from "react";
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
import type {
  CodeQLLanguage, CodeQLSettings, CodeQLSuite, EngineSettings, SonarQubeSettings,
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
    sastApi
      .getSettings(ac.signal)
      .then(setSettings)
      .catch((e) => { if (!ac.signal.aborted) setError(getErrorMessage(e)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, []);

  return { settings, setSettings, loading, error };
}

/** No base configured — a different problem from the service being down. */
function NotConfigured() {
  return (
    <div className="flex gap-3 rounded-card border border-border bg-card p-4">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-text">SonarQube and CodeQL run in a separate service.</p>
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

function SaveRow({ saving, dirty, onSave }: { saving: boolean; dirty: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-border pt-4">
      <Button onClick={onSave} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
      {dirty && !saving && <span className="text-xs text-text-muted">Unsaved changes</span>}
    </div>
  );
}

// ─── SonarQube ───

export function SonarQubeSettingsPanel() {
  const { settings, loading, error } = useEngineSettings();
  const [form, setForm] = useState<SonarQubeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [newExclusion, setNewExclusion] = useState("");
  const toast = useToast();

  useEffect(() => { if (settings) setForm(settings.sonarqube); }, [settings]);

  const dirty = !!form && !!settings && JSON.stringify(form) !== JSON.stringify(settings.sonarqube);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await sastApi.saveSettings("sonarqube", form);
      toast.success("SonarQube settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

  if (!CONFIGURED) return <NotConfigured />;
  if (loading) return <PageLoading />;
  if (error) return <Unreachable message={error} />;
  if (!form) return null;

  const set = <K extends keyof SonarQubeSettings>(k: K, v: SonarQubeSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text">SonarQube</h3>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Runs <code className="rounded bg-card px-1 py-0.5 text-xs">sonar-scanner</code>, waits
            for the server-side analysis to finish, then reads the issues back. Disabling it here
            makes the engine report no findings rather than fail the scan.
          </p>
        </div>
        <ToggleSwitch
          checked={form.enabled}
          onChange={(v) => set("enabled", v)}
          ariaLabel="Enable SonarQube"
        />
      </div>

      <SettingsField label="Server URL">
        <Input
          value={form.hostUrl}
          onChange={(e) => set("hostUrl", e.target.value)}
          placeholder="https://sonarqube.example.com"
          spellCheck={false}
        />
        <p className="mt-1.5 text-xs text-text-muted">Must be https. Leave empty to use the deployment-wide SONAR_HOST_URL.</p>
      </SettingsField>

      <SettingsField label="Quality profile">
        <Input
          value={form.qualityProfile}
          onChange={(e) => set("qualityProfile", e.target.value)}
          placeholder="Sonar way"
        />
        <p className="mt-1.5 text-xs text-text-muted">Optional. Passed as sonar.profile; the server default applies when empty.</p>
      </SettingsField>

      <SettingsField label="Additional exclusions">
        <div className="space-y-2">
          {form.extraExclusions.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {form.extraExclusions.map((glob) => (
                <li
                  key={glob}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs"
                >
                  <code>{glob}</code>
                  <button
                    type="button"
                    aria-label={`Remove exclusion ${glob}`}
                    onClick={() => set("extraExclusions", form.extraExclusions.filter((g) => g !== glob))}
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
              value={newExclusion}
              onChange={(e) => setNewExclusion(e.target.value)}
              placeholder="**/legacy/**"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const g = newExclusion.trim();
                if (g && !form.extraExclusions.includes(g)) {
                  set("extraExclusions", [...form.extraExclusions, g]);
                  setNewExclusion("");
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={!newExclusion.trim() || form.extraExclusions.includes(newExclusion.trim())}
              onClick={() => {
                set("extraExclusions", [...form.extraExclusions, newExclusion.trim()]);
                setNewExclusion("");
              }}
            >
              <PlusIcon className="size-4" aria-hidden /> Add
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-text-muted">Added to the built-in dependency and build-output globs, never instead of them.</p>
      </SettingsField>

      <SettingsField label="Analysis timeout">
        <Input
          type="number"
          min={30}
          max={7200}
          value={form.ceTimeoutSeconds}
          onChange={(e) => set("ceTimeoutSeconds", Number(e.target.value))}
          className="max-w-40"
        />
        <p className="mt-1.5 text-xs text-text-muted">How long to wait for the server to finish processing a submitted report, in seconds.</p>
      </SettingsField>

      <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-text">Delete the scratch project after each scan</p>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Each scan creates a project on the Sonar server. Leaving this off accumulates one dead
            project per scan.
          </p>
        </div>
        <ToggleSwitch
          checked={form.deleteScratchProject}
          onChange={(v) => set("deleteScratchProject", v)}
          ariaLabel="Delete scratch project"
        />
      </div>

      {/* Three components address the same server under three different names.
          Until they are unified, saying so here is the only thing that stops a
          reader pointing this at one host and browsing rules from another. */}
      <div className="space-y-2 rounded-card border border-border bg-background/40 p-4 text-xs text-text-muted">
        <p>
          <span className="font-medium text-text">The token is not stored here.</span> It is read
          from the secret store when a scan runs — the service refuses to persist credentials in
          settings.
        </p>
        <p>
          <span className="font-medium text-text">This host applies to scans only.</span> Browsing
          quality profiles and rules under <em>SonarQube Rules</em> goes through the backend, which
          reads <code className="rounded bg-card px-1 py-0.5">SONARQUBE_URL</code> and{" "}
          <code className="rounded bg-card px-1 py-0.5">SONARQUBE_TOKEN</code> from its own
          environment. Point both at the same server, or the rules you browse will not be the rules
          your scans run.
        </p>
      </div>

      <SaveRow saving={saving} dirty={dirty} onSave={save} />
    </div>
  );
}

// ─── CodeQL ───

export function CodeQLSettingsPanel() {
  const { settings, loading, error } = useEngineSettings();
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
      toast.success("CodeQL settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text">CodeQL</h3>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Builds one database per detected language and runs a query suite over it. Thorough and
            slow — a large repository can take tens of minutes per language.
          </p>
        </div>
        <ToggleSwitch checked={form.enabled} onChange={(v) => set("enabled", v)} label="Enable CodeQL" />
      </div>

      <SettingsField label="Languages">
        <ul className="flex flex-wrap gap-2">
          {LANGUAGES.map(({ id, label, icon }) => {
            const on = form.languages.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggleLang(id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? "border-primary-500/50 bg-primary-500/10 text-text"
                      : "border-border bg-card text-text-muted hover:text-text"
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
          <p className="mt-2 text-xs text-warning-500">
            No languages selected — CodeQL will report no findings for every scan.
          </p>
        )}
        <p className="mt-1.5 text-xs text-text-muted">Narrows what a scan analyses. A language the repository does not contain is skipped regardless.</p>
      </SettingsField>

      <SettingsField label="Query suite">
        <div className="space-y-2">
          {SUITES.map(({ id, label, note }) => (
            <label
              key={id}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${
                form.querySuite === id ? "border-primary-500/50 bg-primary-500/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="codeql-suite"
                checked={form.querySuite === id}
                onChange={() => set("querySuite", id)}
                className="mt-1 accent-primary-500"
              />
              <span className="text-sm">
                <span className="font-medium text-text">{label}</span>
                <span className="mt-0.5 block text-text-muted">{note}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">Which set of queries to run against each database.</p>
      </SettingsField>

      <SettingsField label="Build mode">
        <div className="flex gap-2">
          {(["none", "autobuild"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set("buildMode", mode)}
              aria-pressed={form.buildMode === mode}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                form.buildMode === mode
                  ? "border-primary-500/50 bg-primary-500/10 text-text"
                  : "border-border bg-card text-text-muted hover:text-text"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">“None” builds a database without compiling, which is what most repositories need. “Autobuild” compiles first and is slower, but is required for some compiled projects.</p>
      </SettingsField>

      <SettingsField label="Timeout per language">
        <Input
          type="number"
          min={60}
          max={21600}
          value={form.timeoutSeconds}
          onChange={(e) => set("timeoutSeconds", Number(e.target.value))}
          className="max-w-40"
        />
        <p className="mt-1.5 text-xs text-text-muted">Seconds allowed for building and analysing one database before the engine gives up.</p>
      </SettingsField>

      <SaveRow saving={saving} dirty={dirty} onSave={save} />
    </div>
  );
}
