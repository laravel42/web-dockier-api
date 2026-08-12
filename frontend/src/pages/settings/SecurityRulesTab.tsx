import { useState, useEffect } from "react";
import { codeAnalysisApi } from "@/services/api";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import TechBadge from "@/components/TechBadge";
import { SearchableCombobox } from "@/components/ui/combobox";
import { SettingsField, SettingsTextField } from "@/components/SettingsField";
import { segmentActiveCls, segmentIdleCls } from "@/utils/styles";
import { Input } from "@/components/ui/input";
import Button from "@/components/ui/Button";
import PageLoading from "@/components/ui/PageLoading";
import { PlusIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import RulesFilterSidebar from "./sections/RulesFilterSidebar";
import SonarQubeRulesPanel from "./sections/SonarQubeRulesPanel";
import SemgrepRulesPanel from "./sections/SemgrepRulesPanel";
import { severityDotCls } from "./sections/shared";

// ─── Types ───

interface CRule {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  pattern: string;
  extensions: string[];
  enabled: boolean;
  isSystem: boolean;
}

const toolKeyForSource: Record<string, string> = {
  custom: "customRules",
  sonarqube: "sonarqube",
  semgrep: "semgrep",
};

const extIconMap: Record<string, string> = {
  ".php": "php", ".blade.php": "php", ".js": "javascript", ".ts": "typescript",
  ".jsx": "react", ".tsx": "react", ".vue": "vuejs", ".py": "python",
  ".rb": "ruby", ".java": "java", ".go": "go", ".rs": "rust", ".cs": "csharp",
  ".env": "linux", ".ini": "linux", ".yaml": "yaml", ".yml": "yaml",
  ".json": "json", ".xml": "xml", ".html": "html5", ".sql": "azuresqldatabase",
};

// ─── Main Component ───

export default function SecurityRulesTab() {
  const [ruleSource, setRuleSource] = useState<"custom" | "sonarqube" | "semgrep">("semgrep");
  const [scanTools, setScanTools] = useState<Record<string, boolean>>(() => {
    const savedTools = localStorage.getItem("scan_tools");
    if (savedTools) { try { return JSON.parse(savedTools); } catch { /* ignore */ } }
    return { semgrep: true, sonarqube: true, customRules: true };
  });
  const [toolMessage, setToolMessage] = useState("");

  const toggleTool = (key: string) => {
    setScanTools(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("scan_tools", JSON.stringify(next));
      setToolMessage("Saved");
      setTimeout(() => setToolMessage(""), 1500);
      return next;
    });
  };

  // Auto-switch rule source when current engine is disabled
  useEffect(() => {
    if (!scanTools[toolKeyForSource[ruleSource]]) {
      const sources = [
        { key: "semgrep" as const, toolKey: "semgrep" },
        { key: "custom" as const, toolKey: "customRules" },
      ];
      const first = sources.find(s => scanTools[s.toolKey]);
      if (first) setRuleSource(first.key);
    }
  }, [scanTools, ruleSource]);

  // ─── Custom Rules state ───
  const [rules, setRules] = useState<CRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CRule | null>(null);
  const [form, setForm] = useState({ ruleId: "", severity: "warning", message: "", pattern: "", extensions: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [semgrepFilter, setSemgrepFilter] = useState("");
  const [semgrepAdding, setSemgrepAdding] = useState(false);
  const [sevTab, setSevTab] = useState<string>("");
  const [langFilter, setLangFilter] = useState<Set<string>>(new Set());
  const toast = useToast();

  const fetchRules = async () => {
    setLoading(true);
    try { const res = await codeAnalysisApi.listCustomRules(); setRules(res.rules); }
    catch (err) { toast.error(getErrorMessage(err, "Failed to load custom rules")); } finally { setLoading(false); }
  };
  useEffect(() => { fetchRules(); }, []);

  const openAdd = () => {
    setForm({ ruleId: "custom.", severity: "warning", message: "", pattern: "", extensions: [".php", ".js", ".ts"] });
    setEditingRule(null); setError(""); setShowForm(true);
  };
  const openEdit = (r: CRule) => {
    setForm({ ruleId: r.ruleId, severity: r.severity, message: r.message, pattern: r.pattern, extensions: [...r.extensions] });
    setEditingRule(r); setError(""); setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      try { new RegExp(form.pattern); } catch { throw new Error("Invalid regex pattern"); }
      if (form.extensions.length === 0) throw new Error("Select at least one file extension");
      if (editingRule) {
        await codeAnalysisApi.updateCustomRule(editingRule.id, { ruleId: form.ruleId, severity: form.severity, message: form.message, pattern: form.pattern, extensions: form.extensions });
      } else {
        await codeAnalysisApi.createCustomRule({ ruleId: form.ruleId, severity: form.severity, message: form.message, pattern: form.pattern, extensions: form.extensions });
      }
      setShowForm(false); fetchRules();
    } catch (err: unknown) { setError((err as Error).message || "Failed to save rule"); }
    finally { setSaving(false); }
  };

  const handleToggle = async (r: CRule) => {
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x));
    try {
      await codeAnalysisApi.updateCustomRule(r.id, { enabled: !r.enabled });
    } catch (err) {
      setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: r.enabled } : x));
      toast.error(getErrorMessage(err, "Failed to toggle rule"));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await codeAnalysisApi.deleteCustomRule(deleteId); }
    catch (err) { toast.error(getErrorMessage(err, "Failed to delete rule")); }
    setDeleteId(null); fetchRules();
  };

  const filtered = (filter ? rules.filter(r => r.ruleId.toLowerCase().includes(filter.toLowerCase()) || r.message.toLowerCase().includes(filter.toLowerCase())) : rules)
    .filter(r => !sevTab || r.severity === sevTab)
    .filter(r => langFilter.size === 0 || r.extensions.some(ext => langFilter.has(ext)));
  const counts = { error: rules.filter(r => r.severity === "error").length, warning: rules.filter(r => r.severity === "warning").length, info: rules.filter(r => r.severity === "info").length };

  // ─── Render ───

  return (
    <div>
      {/* Scan Engine Toggles */}
      <div className="bg-card rounded-card shadow-(--shadow-card) p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-text">Security Tools</p>
            <p className="text-xs text-text-muted mt-0.5">Manage tools and rules used during security scans.</p>
          </div>
          {toolMessage && <span className="text-xs text-primary-500 font-medium">{toolMessage}</span>}
        </div>
        <div className="flex gap-3">
          {([
            { key: "semgrep", name: "Semgrep" },
            { key: "customRules", name: "Custom Rules" },
          ] as const).map(({ key, name }) => (
            <div key={key} className="flex items-center gap-2.5 text-sm">
              <span className={scanTools[key] ? "text-text font-medium" : "text-text-muted"}>{name}</span>
              <ToggleSwitch checked={scanTools[key]} onChange={() => toggleTool(key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Source selector + content */}
      {(() => {
        const sources: Array<{ key: "custom" | "sonarqube" | "semgrep"; label: string; toolKey: string }> = [
          { key: "semgrep", label: "Semgrep", toolKey: "semgrep" },
          { key: "custom", label: "Custom Rules", toolKey: "customRules" },
        ];
        const enabled = sources.filter(s => scanTools[s.toolKey]);
        const activeVisible = enabled.some(s => s.key === ruleSource);
        const effectiveSource = activeVisible ? ruleSource : (enabled[0]?.key ?? "custom");

        return enabled.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Enable at least one scan engine above to manage its rules.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              {enabled.map(s => (
                <button key={s.key} onClick={() => setRuleSource(s.key)} className={`h-9 px-4 text-sm font-medium rounded-lg border transition-all ${effectiveSource === s.key ? segmentActiveCls : segmentIdleCls}`}>
                  {s.label}
                </button>
              ))}
              {effectiveSource === "custom" && (
                <div className="ml-auto flex items-center gap-2">
                  <Input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter rules…" style={{ width: 280 }} />
                  <Button onClick={openAdd} iconLeft={<PlusIcon className="size-4" />} className="shrink-0">
                    Add Rule
                  </Button>
                </div>
              )}
              {effectiveSource === "semgrep" && (
                <div className="ml-auto flex items-center gap-2">
                  <Input type="text" value={semgrepFilter} onChange={e => setSemgrepFilter(e.target.value)} placeholder="Filter rules…" style={{ width: 280 }} />
                  <Button onClick={() => setSemgrepAdding(true)} iconLeft={<PlusIcon className="size-4" />} className="shrink-0">
                    Add Rule
                  </Button>
                </div>
              )}
            </div>

            {effectiveSource === "sonarqube" ? (
              <SonarQubeRulesPanel />
            ) : effectiveSource === "semgrep" ? (
              <SemgrepRulesPanel filter={semgrepFilter} adding={semgrepAdding} onAddingDone={() => setSemgrepAdding(false)} />
            ) : (
              <CustomRulesPanel
                rules={rules}
                filtered={filtered}
                counts={counts}
                loading={loading}
                sevTab={sevTab}
                langFilter={langFilter}
                showForm={showForm}
                editingRule={editingRule}
                form={form}
                saving={saving}
                error={error}
                deleteId={deleteId}
                onSevTabChange={setSevTab}
                onLangFilterChange={setLangFilter}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onFormChange={setForm}
                onSave={handleSave}
                onCloseForm={() => setShowForm(false)}
                onConfirmDelete={handleDelete}
                onCloseDelete={() => setDeleteId(null)}
              />
            )}
          </>
        );
      })()}
    </div>
  );
}

// ─── Custom Rules Panel (inline — tightly coupled to parent state) ───

interface CustomRulesPanelProps {
  rules: CRule[];
  filtered: CRule[];
  counts: { error: number; warning: number; info: number };
  loading: boolean;
  sevTab: string;
  langFilter: Set<string>;
  showForm: boolean;
  editingRule: CRule | null;
  form: { ruleId: string; severity: string; message: string; pattern: string; extensions: string[] };
  saving: boolean;
  error: string;
  deleteId: string | null;
  onSevTabChange: (key: string) => void;
  onLangFilterChange: (fn: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  onToggle: (r: CRule) => void;
  onEdit: (r: CRule) => void;
  onDelete: (id: string) => void;
  onFormChange: (form: { ruleId: string; severity: string; message: string; pattern: string; extensions: string[] }) => void;
  onSave: (e: React.FormEvent) => void;
  onCloseForm: () => void;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;
}

function CustomRulesPanel({
  rules,
  filtered,
  counts,
  loading,
  sevTab,
  langFilter,
  showForm,
  editingRule,
  form,
  saving,
  error,
  deleteId,
  onSevTabChange,
  onLangFilterChange,
  onToggle,
  onEdit,
  onDelete,
  onFormChange,
  onSave,
  onCloseForm,
  onConfirmDelete,
  onCloseDelete,
}: CustomRulesPanelProps) {
  return (
    <>
      <div className="flex gap-4">
        <RulesFilterSidebar
          severities={[
            { key: "error", label: "Error", count: counts.error, color: "text-danger-500", icon: "🔴" },
            { key: "warning", label: "Warning", count: counts.warning, color: "text-warning-500", icon: "🟡" },
            { key: "info", label: "Info", count: counts.info, color: "text-primary-500", icon: "🔵" },
          ]}
          activeSeverity={sevTab}
          onSeverityChange={(k) => onSevTabChange(k)}
          languages={[
            { key: ".php", icon: "php", label: "PHP", count: rules.filter(r => r.extensions.includes(".php")).length },
            { key: ".js", icon: "javascript", label: "JS/JSX", count: rules.filter(r => r.extensions.some(e => [".js", ".jsx"].includes(e))).length },
            { key: ".ts", icon: "typescript", label: "TS/TSX", count: rules.filter(r => r.extensions.some(e => [".ts", ".tsx"].includes(e))).length },
            { key: ".vue", icon: "vuejs", label: "Vue", count: rules.filter(r => r.extensions.includes(".vue")).length },
            { key: ".py", icon: "python", label: "Python", count: rules.filter(r => r.extensions.includes(".py")).length },
            { key: ".rb", icon: "ruby", label: "Ruby", count: rules.filter(r => r.extensions.includes(".rb")).length },
            { key: ".java", icon: "java", label: "Java", count: rules.filter(r => r.extensions.includes(".java")).length },
            { key: ".go", icon: "go", label: "Go", count: rules.filter(r => r.extensions.includes(".go")).length },
            { key: ".rs", icon: "rust", label: "Rust", count: rules.filter(r => r.extensions.includes(".rs")).length },
            { key: ".cs", icon: "csharp", label: "C#", count: rules.filter(r => r.extensions.includes(".cs")).length },
            { key: ".yaml", icon: "yaml", label: "YAML", count: rules.filter(r => r.extensions.some(e => [".yaml", ".yml"].includes(e))).length },
            { key: ".json", icon: "json", label: "JSON", count: rules.filter(r => r.extensions.includes(".json")).length },
            { key: ".html", icon: "html5", label: "HTML", count: rules.filter(r => r.extensions.includes(".html")).length },
            { key: ".sql", icon: "azuresqldatabase", label: "SQL", count: rules.filter(r => r.extensions.includes(".sql")).length },
          ]}
          activeLangs={langFilter}
          onLangToggle={(k) => onLangFilterChange(prev => {
            const n = new Set(prev);
            const grouped: Record<string, string[]> = { ".js": [".js", ".jsx"], ".ts": [".ts", ".tsx"] };
            const exts = grouped[k] || [k];
            const active = exts.every(e => n.has(e));
            for (const e of exts) { if (active) n.delete(e); else n.add(e); }
            return n;
          })}
          onLangClear={() => onLangFilterChange(new Set())}
        />

        <div className="flex-1 min-w-0">
          <Modal open={showForm} onClose={onCloseForm} title={editingRule ? "Edit Rule" : "Add Custom Rule"}>
            <form onSubmit={onSave} className="space-y-4">
              <SettingsTextField id="rule-id" label="Rule ID" type="text" value={form.ruleId} onChange={e => onFormChange({ ...form, ruleId: e.target.value })} placeholder="custom.category.name" required />
              <SettingsField label="Severity">
                <SearchableCombobox
                  value={form.severity}
                  onValueChange={(severity) => onFormChange({ ...form, severity })}
                  options={[
                    { value: "error", label: "Error" },
                    { value: "warning", label: "Warning" },
                    { value: "info", label: "Info" },
                  ]}
                  placeholder="Select severity"
                />
              </SettingsField>
              <SettingsTextField id="rule-message" label="Message" type="text" value={form.message} onChange={e => onFormChange({ ...form, message: e.target.value })} placeholder="Description of the vulnerability" required />
              <SettingsField label="Regex Pattern">
                <Input type="text" value={form.pattern} onChange={e => onFormChange({ ...form, pattern: e.target.value })} className="font-mono text-xs" placeholder="\beval\s*\(" required />
                <p className="text-xs text-text-muted mt-1">JavaScript regex syntax (flags gi applied automatically)</p>
              </SettingsField>
              <SettingsField label="File Extensions">
                <div className="flex flex-wrap gap-2">
                  {([
                    { ext: ".php", icon: "php", label: "PHP" }, { ext: ".blade.php", icon: "php", label: "Blade" },
                    { ext: ".js", icon: "javascript", label: "JS" }, { ext: ".ts", icon: "typescript", label: "TS" },
                    { ext: ".jsx", icon: "react", label: "JSX" }, { ext: ".tsx", icon: "react", label: "TSX" },
                    { ext: ".vue", icon: "vuejs", label: "Vue" }, { ext: ".py", icon: "python", label: "Python" },
                    { ext: ".rb", icon: "ruby", label: "Ruby" }, { ext: ".java", icon: "java", label: "Java" },
                    { ext: ".go", icon: "go", label: "Go" }, { ext: ".rs", icon: "rust", label: "Rust" },
                    { ext: ".cs", icon: "csharp", label: "C#" }, { ext: ".env", icon: "linux", label: ".env" },
                    { ext: ".yaml", icon: "yaml", label: "YAML" }, { ext: ".json", icon: "json", label: "JSON" },
                    { ext: ".html", icon: "html5", label: "HTML" }, { ext: ".sql", icon: "azuresqldatabase", label: "SQL" },
                  ]).map(({ ext, icon, label }) => {
                    const selected = form.extensions.includes(ext);
                    return (
                      <button key={ext} type="button"
                        onClick={() => onFormChange({ ...form, extensions: selected ? form.extensions.filter(e => e !== ext) : [...form.extensions, ext] })}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          selected ? "border-primary-500 bg-primary-500/15 text-primary-300" : "border-border bg-card text-text-muted hover:border-primary-500/30"
                        }`}>
                        <TechBadge name={ext} icon={icon} iconOnly />{label}
                      </button>
                    );
                  })}
                </div>
              </SettingsField>
              {error && <p className="text-sm text-danger-500">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={saving} loading={saving}>{saving ? "Saving…" : editingRule ? "Update" : "Create"}</Button>
              </div>
            </form>
          </Modal>

          <ConfirmModal open={!!deleteId} onClose={onCloseDelete} onConfirm={onConfirmDelete} message="Are you sure you want to delete this custom rule?" />

          {loading ? (
            <PageLoading />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map(r => (
                <div key={r.id} className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-all ${!r.enabled ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full shrink-0 ${severityDotCls(r.severity)}`} />
                    <span className="text-xs font-mono text-text-muted truncate flex-1">{r.ruleId}</span>
                    {r.isSystem && <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary-100 text-text-muted shrink-0">System</span>}
                    <ToggleSwitch checked={r.enabled} onChange={() => onToggle(r)} />
                  </div>
                  <p className="text-sm/relaxed text-text">{r.message}</p>
                  <code className="text-xs text-text-muted font-mono bg-secondary-50 px-2 py-1 rounded truncate">{r.pattern}</code>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-wrap gap-1 flex-1">
                      {r.extensions.map(ext => (
                        <TechBadge key={ext} name={ext} icon={extIconMap[ext]} label={ext} />
                      ))}
                    </div>
                    {!r.isSystem && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => onEdit(r)} className="size-7 flex items-center justify-center rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-500/10 transition-colors" aria-label="Edit">
                          <SquarePenIcon className="size-3.5" />
                        </button>
                        <button onClick={() => onDelete(r.id)} className="size-7 flex items-center justify-center rounded-md text-text-muted hover:text-danger-500 hover:bg-danger-500/10 transition-colors" aria-label="Delete">
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-2">No rules found</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
