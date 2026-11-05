import { useCallback, useEffect, useId, useState } from "react";
import { sastApi } from "@/services/api";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { SettingsField } from "@/components/SettingsField";
import { Input } from "@/components/ui/input";
import Button from "@/components/ui/Button";
import PageLoading from "@/components/ui/PageLoading";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { TriangleAlertIcon, InfoIcon, PlusIcon, XIcon } from "lucide-react";
import type { EngineSettings, RegexSettings, SemgrepSettings } from "@/types/sast";

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
        <p className="font-medium text-text">These engines run in a separate service.</p>
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

// ─── Semgrep ───

export function SemgrepSettingsPanel() {
  const { settings, loading, error } = useEngineSettings();
  const [form, setForm] = useState<SemgrepSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const fid = useId();

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

      <SettingsField id={`${fid}-rule-timeout`} label="Per-rule timeout">
        <Input
          id={`${fid}-rule-timeout`}
          type="number" min={5} max={600} className="max-w-40"
          value={form.ruleTimeoutSeconds}
          onChange={(e) => set("ruleTimeoutSeconds", Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          Seconds one rule may spend on one file. A pathological rule/file pair can otherwise hang a
          whole scan.
        </p>
      </SettingsField>

      <SettingsField id={`${fid}-scan-timeout`} label="Whole-scan timeout">
        <Input
          id={`${fid}-scan-timeout`}
          type="number" min={60} max={21600} className="max-w-40"
          value={form.scanTimeoutSeconds}
          onChange={(e) => set("scanTimeoutSeconds", Number(e.target.value))}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          Seconds before the engine gives up on a repository entirely.
        </p>
      </SettingsField>

      <SettingsField id={`${fid}-max-target-bytes`} label="Maximum file size">
        <Input
          id={`${fid}-max-target-bytes`}
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
  const fid = useId();

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

      <SettingsField id={`${fid}-max-file-bytes`} label="Maximum file size">
        <Input
          id={`${fid}-max-file-bytes`}
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
