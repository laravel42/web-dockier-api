import { useState, useEffect } from "react";
import { codeAnalysisApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import TechBadge from "../../components/TechBadge";
import YamlEditor from "../../components/YamlEditor";
import { inputCls, btnPrimary } from "../../utils/styles";
import Spinner from "../../components/Spinner";

interface CRule {
  id: string; ruleId: string; severity: string; message: string;
  pattern: string; extensions: string[]; enabled: boolean; isSystem: boolean;
}

export default function SecurityRulesTab() {
  const [ruleSource, setRuleSource] = useState<"custom" | "semgrep">("semgrep");
  const [scanTools, setScanTools] = useState<Record<string, boolean>>(() => {
    const savedTools = localStorage.getItem("scan_tools");
    if (savedTools) { try { return JSON.parse(savedTools); } catch { /* ignore */ } }
    return { semgrep: true, customRules: true };
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
    const toolKey: Record<string, string> = { custom: "customRules", semgrep: "semgrep" };
    if (!scanTools[toolKey[ruleSource]]) {
      const sources = [
        { key: "semgrep" as const, toolKey: "semgrep" },
        { key: "custom" as const, toolKey: "customRules" },
      ];
      const first = sources.find(s => scanTools[s.toolKey]);
      if (first) setRuleSource(first.key);
    }
  }, [scanTools, ruleSource]);
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

  const fetchRules = async () => {
    setLoading(true);
    try { const res = await codeAnalysisApi.listCustomRules(); setRules(res.rules); }
    catch { /* ignore */ } finally { setLoading(false); }
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
    try {
      await codeAnalysisApi.updateCustomRule(r.id, { enabled: !r.enabled });
      setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x));
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await codeAnalysisApi.deleteCustomRule(deleteId); } catch { /* ignore */ }
    setDeleteId(null); fetchRules();
  };

  const filtered = (filter ? rules.filter(r => r.ruleId.toLowerCase().includes(filter.toLowerCase()) || r.message.toLowerCase().includes(filter.toLowerCase())) : rules)
    .filter(r => !sevTab || r.severity === sevTab)
    .filter(r => langFilter.size === 0 || r.extensions.some(ext => langFilter.has(ext)));
  const counts = { error: rules.filter(r => r.severity === "error").length, warning: rules.filter(r => r.severity === "warning").length, info: rules.filter(r => r.severity === "info").length };

  const extIconMap: Record<string, string> = {
    ".php": "php", ".blade.php": "php", ".js": "javascript", ".ts": "typescript",
    ".jsx": "react", ".tsx": "react", ".vue": "vuejs", ".py": "python",
    ".rb": "ruby", ".java": "java", ".go": "go", ".rs": "rust", ".cs": "csharp",
    ".env": "linux", ".ini": "linux", ".yaml": "yaml", ".yml": "yaml",
    ".json": "json", ".xml": "xml", ".html": "html5", ".sql": "azuresqldatabase",
  };

  return (
    <div>
      {/* Scan Engine Toggles */}
      <div className="bg-card rounded-(--radius-card) shadow-(--shadow-card) p-4 mb-4">
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
            <button key={key} type="button" onClick={() => toggleTool(key)}
              className="flex items-center gap-2.5 text-sm">
              <span className={scanTools[key] ? "text-text font-medium" : "text-text-muted"}>{name}</span>
              <span className={`w-8 h-4.5 rounded-full shrink-0 transition-colors relative ${scanTools[key] ? "bg-primary-500" : "bg-secondary-200"}`}>
                <span className={`absolute top-px w-4 h-4 rounded-full bg-white shadow transition-transform ${scanTools[key] ? "left-3.5" : "left-px"}`} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Source selector + search */}
      {(() => {
        const sources: Array<{ key: "custom" | "semgrep"; label: string; toolKey: string }> = [
          { key: "semgrep", label: "Semgrep", toolKey: "semgrep" },
          { key: "custom", label: "Custom Rules", toolKey: "customRules" },
        ];
        const enabled = sources.filter(s => scanTools[s.toolKey]);
        const activeVisible = enabled.some(s => s.key === ruleSource);
        const effectiveSource = activeVisible ? ruleSource : (enabled[0]?.key ?? "custom");
        if (!activeVisible && effectiveSource !== ruleSource) {
          // Will update on next render via the effect below
        }
        return enabled.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Enable at least one scan engine above to manage its rules.</p>
        ) : (
          <>
          <div className="flex items-center gap-2 mb-4">
            {enabled.map(s => (
              <button key={s.key} onClick={() => setRuleSource(s.key)} className={`h-9 px-4 text-sm font-medium rounded-lg border transition-all ${effectiveSource === s.key ? "border-primary-500 bg-primary-50 text-primary-600" : "border-border text-text-muted hover:border-primary-300"}`}>
                {s.label}
              </button>
            ))}
            {effectiveSource === "custom" && (
              <div className="ml-auto flex items-center gap-2">
                <input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter rules…" className={inputCls} style={{ width: 280 }} />
                <button onClick={openAdd} className={`${btnPrimary} inline-flex items-center gap-2 shrink-0`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add Rule
                </button>
              </div>
            )}
            {effectiveSource === "semgrep" && (
              <div className="ml-auto flex items-center gap-2">
                <input type="text" value={semgrepFilter} onChange={e => setSemgrepFilter(e.target.value)} placeholder="Filter rules…" className={inputCls} style={{ width: 280 }} />
                <button onClick={() => setSemgrepAdding(true)} className={`${btnPrimary} inline-flex items-center gap-2 shrink-0`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add Rule
                </button>
              </div>
            )}
          </div>

          {effectiveSource === "semgrep" ? (
            <SemgrepRulesPanel filter={semgrepFilter} adding={semgrepAdding} onAddingDone={() => setSemgrepAdding(false)} />
          ) : (
      <>

      <div className="flex gap-4">
        {/* Sidebar filters */}
        <RulesFilterSidebar
          severities={[
            { key: "error", label: "Error", count: counts.error, color: "text-danger-500", icon: "🔴" },
            { key: "warning", label: "Warning", count: counts.warning, color: "text-warning-500", icon: "🟡" },
            { key: "info", label: "Info", count: counts.info, color: "text-primary-500", icon: "🔵" },
          ]}
          activeSeverity={sevTab}
          onSeverityChange={(k) => setSevTab(k)}
          languages={[
            { key: ".php", icon: "php", label: "PHP", count: rules.filter(r => r.extensions.includes(".php")).length },
            { key: ".js", icon: "javascript", label: "JS/JSX", count: rules.filter(r => r.extensions.some(e => [".js",".jsx"].includes(e))).length },
            { key: ".ts", icon: "typescript", label: "TS/TSX", count: rules.filter(r => r.extensions.some(e => [".ts",".tsx"].includes(e))).length },
            { key: ".vue", icon: "vuejs", label: "Vue", count: rules.filter(r => r.extensions.includes(".vue")).length },
            { key: ".py", icon: "python", label: "Python", count: rules.filter(r => r.extensions.includes(".py")).length },
            { key: ".rb", icon: "ruby", label: "Ruby", count: rules.filter(r => r.extensions.includes(".rb")).length },
            { key: ".java", icon: "java", label: "Java", count: rules.filter(r => r.extensions.includes(".java")).length },
            { key: ".go", icon: "go", label: "Go", count: rules.filter(r => r.extensions.includes(".go")).length },
            { key: ".rs", icon: "rust", label: "Rust", count: rules.filter(r => r.extensions.includes(".rs")).length },
            { key: ".cs", icon: "csharp", label: "C#", count: rules.filter(r => r.extensions.includes(".cs")).length },
            { key: ".yaml", icon: "yaml", label: "YAML", count: rules.filter(r => r.extensions.some(e => [".yaml",".yml"].includes(e))).length },
            { key: ".json", icon: "json", label: "JSON", count: rules.filter(r => r.extensions.includes(".json")).length },
            { key: ".html", icon: "html5", label: "HTML", count: rules.filter(r => r.extensions.includes(".html")).length },
            { key: ".sql", icon: "azuresqldatabase", label: "SQL", count: rules.filter(r => r.extensions.includes(".sql")).length },
          ]}
          activeLangs={langFilter}
          onLangToggle={(k) => setLangFilter(prev => {
            const n = new Set(prev);
            const grouped: Record<string, string[]> = { ".js": [".js", ".jsx"], ".ts": [".ts", ".tsx"] };
            const exts = grouped[k] || [k];
            const active = exts.every(e => n.has(e));
            for (const e of exts) { if (active) n.delete(e); else n.add(e); }
            return n;
          })}
          onLangClear={() => setLangFilter(new Set())}
        />

        {/* Rules grid */}
        <div className="flex-1 min-w-0">

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingRule ? "Edit Rule" : "Add Custom Rule"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Rule ID</label>
            <input type="text" value={form.ruleId} onChange={e => setForm({ ...form, ruleId: e.target.value })} className={inputCls} placeholder="custom.category.name" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Severity</label>
            <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} className={inputCls}>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Message</label>
            <input type="text" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className={inputCls} placeholder="Description of the vulnerability" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Regex Pattern</label>
            <input type="text" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} className={`${inputCls} font-mono text-xs`} placeholder="\beval\s*\(" required />
            <p className="text-xs text-text-muted mt-1">JavaScript regex syntax (flags gi applied automatically)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">File Extensions</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { ext: ".php", icon: "php", label: "PHP" }, { ext: ".blade.php", icon: "php", label: "Blade" },
                { ext: ".js", icon: "javascript", label: "JS" }, { ext: ".ts", icon: "typescript", label: "TS" },
                { ext: ".jsx", icon: "react", label: "JSX" }, { ext: ".tsx", icon: "react", label: "TSX" },
                { ext: ".vue", icon: "vuejs", label: "Vue" }, { ext: ".py", icon: "python", label: "PY" },
                { ext: ".rb", icon: "ruby", label: "RB" }, { ext: ".java", icon: "java", label: "Java" },
                { ext: ".go", icon: "go", label: "Go" }, { ext: ".rs", icon: "rust", label: "RS" },
                { ext: ".cs", icon: "csharp", label: "C#" }, { ext: ".env", icon: "linux", label: ".env" },
                { ext: ".yaml", icon: "yaml", label: "YAML" }, { ext: ".json", icon: "json", label: "JSON" },
                { ext: ".html", icon: "html5", label: "HTML" }, { ext: ".sql", icon: "azuresqldatabase", label: "SQL" },
              ]).map(({ ext, icon, label }) => {
                const selected = form.extensions.includes(ext);
                return (
                  <button key={ext} type="button"
                    onClick={() => setForm(f => ({ ...f, extensions: selected ? f.extensions.filter(e => e !== ext) : [...f.extensions, ext] }))}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all ${
                      selected ? "border-primary-500 bg-primary-50 text-primary-600" : "border-border bg-card text-text-muted hover:border-primary-300"
                    }`}>
                    <TechBadge name={ext} icon={icon} iconOnly iconSize="w-3.5 h-3.5" />{label}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? "Saving…" : editingRule ? "Update" : "Create"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} message="Are you sure you want to delete this custom rule?" />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(r => (
            <div key={r.id} className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-all ${!r.enabled ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.severity === "error" ? "#ef4444" : r.severity === "warning" ? "#eab308" : "#3b82f6" }} />
                <span className="text-xs font-mono text-text-muted truncate flex-1">{r.ruleId}</span>
                {r.isSystem && <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary-100 text-text-muted shrink-0">System</span>}
                <button type="button" onClick={() => handleToggle(r)} className={`w-8 h-4.5 rounded-full shrink-0 transition-colors relative ${r.enabled ? "bg-primary-500" : "bg-secondary-200"}`}>
                  <span className={`absolute top-px w-4 h-4 rounded-full bg-white shadow transition-transform ${r.enabled ? "left-3.5" : "left-px"}`} />
                </button>
              </div>
              <p className="text-sm text-text leading-relaxed">{r.message}</p>
              <code className="text-xs text-text-muted font-mono bg-secondary-50 px-2 py-1 rounded truncate">{r.pattern}</code>
              <div className="flex items-end gap-2">
                <div className="flex flex-wrap gap-1 flex-1">
                  {r.extensions.map(ext => (
                    <TechBadge key={ext} name={ext} icon={extIconMap[ext]} label={ext} />
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(r)} className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors" aria-label="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  {!r.isSystem && (
                    <button onClick={() => setDeleteId(r.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-danger-500 hover:bg-danger-500/10 transition-colors" aria-label="Delete">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-2">No rules found</p>}
        </div>
      )}
      </div>{/* end flex-1 */}
      </div>{/* end flex gap-4 */}
      </>
      )}
      </>
        );
      })()}
    </div>
  );
}

function RulesFilterSidebar({ severities, activeSeverity, onSeverityChange, languages, activeLangs, onLangToggle, onLangClear }: {
  severities: Array<{ key: string; label: string; count: number; color: string; icon?: string }>;
  activeSeverity: string;
  onSeverityChange: (key: string) => void;
  languages: Array<{ key: string; icon: string; label: string; count?: number }>;
  activeLangs: Set<string>;
  onLangToggle: (key: string) => void;
  onLangClear: () => void;
}) {
  const [sevOpen, setSevOpen] = useState(true);
  const [techOpen, setTechOpen] = useState(true);

  const chevron = (open: boolean) => (
    <svg className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );

  return (
    <div className="w-52 shrink-0 space-y-1.5 self-start sticky top-6">
      {/* Severity */}
      <div className="bg-secondary-50/60 rounded-lg overflow-hidden">
        <button onClick={() => setSevOpen(!sevOpen)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-text hover:bg-secondary-100 transition-colors">
          Severity {chevron(sevOpen)}
        </button>
        {sevOpen && (
          <div className="px-2 pb-2 space-y-0.5">
            {severities.map(s => (
              <button key={s.key} onClick={() => onSeverityChange(activeSeverity === s.key ? "" : s.key)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${activeSeverity === s.key ? "bg-primary-500 text-white font-medium" : "text-text-muted hover:bg-secondary-100"}`}>
                <span className="flex items-center gap-2">{s.icon && <span className="text-[10px]">{s.icon}</span>}{s.label}</span>
                <span className={`text-xs ${activeSeverity === s.key ? "text-white/70" : s.color}`}>{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Technology */}
      <div className="bg-secondary-50/60 rounded-lg overflow-hidden">
        <button onClick={() => setTechOpen(!techOpen)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-text hover:bg-secondary-100 transition-colors">
          Technology {chevron(techOpen)}
        </button>
        {techOpen && (
          <div className="px-2 pb-2 space-y-0.5">
              {languages.map(l => {
                const active = activeLangs.has(l.key);
                return (
                  <button key={l.key} type="button" onClick={() => onLangToggle(l.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${active ? "bg-primary-50 text-primary-600 font-medium" : "text-text-muted hover:bg-secondary-100"}`}>
                    <TechBadge name={l.key} icon={l.icon} iconOnly iconSize="w-5 h-5" />
                    <span className="text-sm truncate flex-1 text-left">{l.label}</span>
                    {l.count !== undefined && <span className="text-xs font-semibold">{l.count}</span>}
                  </button>
                );
              })}
            {activeLangs.size > 0 && (
              <button type="button" onClick={onLangClear} className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:text-text transition-colors">Clear all</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

let _ogCache: Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }> | null = null;

interface SemgrepDbRule {
  id: string; ruleId: string; severity: string; message: string;
  yamlContent: string; enabled: boolean; isSystem: boolean; createdAt: string;
}

function SemgrepRulesPanel({ filter, adding, onAddingDone }: { filter: string; adding: boolean; onAddingDone: () => void }) {
  // Built-in rules from the rules directory
  const [builtinRules, setBuiltinRules] = useState<Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }>>([]);
  // User-created semgrep rules from DB
  const [dbRules, setDbRules] = useState<SemgrepDbRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(30);
  const [disabledRules, setDisabledRules] = useState<Set<string>>(new Set());
  const [editRule, setEditRule] = useState<{ id: string; ruleId: string; yamlContent: string; isBuiltin: boolean; path?: string } | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const SEMGREP_TEMPLATE = `rules:
  - id: custom.my-rule
    languages:
      - javascript
    severity: WARNING
    message: >-
      Describe why this pattern is problematic and how to fix it.
    pattern: |
      dangerous_function(...)
`;
  const [newRuleContent, setNewRuleContent] = useState(SEMGREP_TEMPLATE);
  const [newRuleId, setNewRuleId] = useState("custom.my-rule");
  const [newRuleSaving, setNewRuleSaving] = useState(false);
  const [newRuleError, setNewRuleError] = useState("");

  useEffect(() => {
    if (adding) {
      setNewRuleContent(SEMGREP_TEMPLATE);
      setNewRuleId("custom.my-rule");
      setNewRuleError("");
    }
  }, [adding, SEMGREP_TEMPLATE]);

  // Load disabled overrides for built-in rules
  useEffect(() => {
    codeAnalysisApi.listRuleOverrides("semgrep").then(res => {
      setDisabledRules(new Set(res.overrides.filter(o => !o.enabled).map(o => o.ruleId)));
    }).catch(() => {});
  }, []);

  const toggleBuiltinRule = (id: string) => {
    const nowEnabled = disabledRules.has(id);
    setDisabledRules(prev => {
      const n = new Set(prev);
      if (nowEnabled) n.delete(id); else n.add(id);
      return n;
    });
    codeAnalysisApi.toggleRule("semgrep", id, nowEnabled).catch(() => {});
  };

  const toggleDbRule = async (r: SemgrepDbRule) => {
    try {
      await codeAnalysisApi.updateCustomRule(r.id, { enabled: !r.enabled });
      setDbRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x));
    } catch { /* ignore */ }
  };

  const openEditModal = async (r: { id: string; ruleId: string; isBuiltin: boolean; path?: string; yamlContent?: string }) => {
    setEditRule({ id: r.id, ruleId: r.ruleId, yamlContent: r.yamlContent || "", isBuiltin: r.isBuiltin, path: r.path });
    setEditLoading(true); setEditContent("");
    if (r.isBuiltin && r.path) {
      try {
        const res = await codeAnalysisApi.getOpengrepRuleContent(r.path);
        setEditContent(res.content);
      } catch { setEditContent("# Failed to load rule content"); }
    } else {
      setEditContent(r.yamlContent || "");
    }
    setEditLoading(false);
  };

  const handleEditSave = async () => {
    if (!editRule) return;
    setEditSaving(true);
    try {
      if (editRule.isBuiltin && editRule.path) {
        await codeAnalysisApi.updateOpengrepRuleContent(editRule.path, editContent);
        _ogCache = null;
        codeAnalysisApi.listOpengrepRules().then(res => { setBuiltinRules(res.rules); _ogCache = res.rules; }).catch(() => {});
      } else {
        await codeAnalysisApi.updateCustomRule(editRule.id, { yamlContent: editContent });
        setDbRules(prev => prev.map(x => x.id === editRule.id ? { ...x, yamlContent: editContent } : x));
      }
      setEditRule(null);
    } catch { /* ignore */ }
    finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await codeAnalysisApi.deleteCustomRule(deleteId); } catch { /* ignore */ }
    setDeleteId(null);
    setDbRules(prev => prev.filter(r => r.id !== deleteId));
  };

  // Load built-in rules + DB rules
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [builtinRes, dbRes] = await Promise.all([
          _ogCache ? Promise.resolve({ rules: _ogCache }) : codeAnalysisApi.listOpengrepRules(),
          codeAnalysisApi.listCustomRules("semgrep"),
        ]);
        if (!cancelled) {
          setBuiltinRules(builtinRes.rules);
          _ogCache = builtinRes.rules;
          setDbRules(dbRes.rules);
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message || "Failed to load rules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Merge built-in + DB rules into a unified list for display
  type UnifiedRule = { id: string; ruleId: string; name: string; lang: string; severity: string; message: string; enabled: boolean; isBuiltin: boolean; path?: string; yamlContent?: string; isSystem?: boolean; dbId?: string };
  const allRules: UnifiedRule[] = [
    ...dbRules.map(r => ({
      id: r.id, ruleId: r.ruleId, name: r.ruleId, lang: "custom", severity: r.severity,
      message: r.message, enabled: r.enabled, isBuiltin: false, yamlContent: r.yamlContent, dbId: r.id,
    })),
    ...builtinRules.map(r => ({
      id: r.id, ruleId: r.id, name: r.name, lang: r.lang, severity: r.severity,
      message: r.message, enabled: !disabledRules.has(r.id), isBuiltin: true, path: r.path,
    })),
  ];

  const rules = allRules
    .filter(r => !filter || r.ruleId.toLowerCase().includes(filter.toLowerCase()) || r.name.toLowerCase().includes(filter.toLowerCase()) || r.message.toLowerCase().includes(filter.toLowerCase()))
    .filter(r => selectedLangs.size === 0 || selectedLangs.has(r.lang))
    .filter(r => !sevFilter || r.severity === sevFilter);

  const langIcon: Record<string, string> = {
    java: "java", javascript: "javascript", typescript: "typescript", python: "python", php: "php",
    go: "go", ruby: "ruby", rust: "rust", c: "c", csharp: "csharp", kotlin: "kotlin",
    swift: "swift", scala: "scala", bash: "bash", dockerfile: "docker", terraform: "terraform",
    html: "html5", json: "json", yaml: "yaml", elixir: "elixir", solidity: "solidity",
    clojure: "clojure", ocaml: "ocaml", apex: "apex", generic: "generic", sql: "sql"
  };

  const languages = [...new Set(allRules.map(r => r.lang))].sort().map(l => ({
    key: l, icon: langIcon[l] || l, label: l.charAt(0).toUpperCase() + l.slice(1),
    count: allRules.filter(r => r.lang === l).length,
  }));

  const sevCounts = {
    error: allRules.filter(r => r.severity === "error").length,
    warning: allRules.filter(r => r.severity === "warning").length,
    info: allRules.filter(r => r.severity === "info").length,
  };

  const shown = rules.slice(0, visible);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <div className="bg-card rounded-xl border border-border p-6 text-center"><p className="text-sm text-danger-500">{error}</p></div>;

  return (
    <div className="flex gap-4">
      <RulesFilterSidebar
        severities={[
          { key: "error", label: "Error", count: sevCounts.error, color: "text-danger-500", icon: "🔴" },
          { key: "warning", label: "Warning", count: sevCounts.warning, color: "text-warning-500", icon: "🟡" },
          { key: "info", label: "Info", count: sevCounts.info, color: "text-primary-500", icon: "🔵" },
        ]}
        activeSeverity={sevFilter}
        onSeverityChange={(k) => { setSevFilter(k); setVisible(30); }}
        languages={languages}
        activeLangs={selectedLangs}
        onLangToggle={(k) => { setSelectedLangs(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }); setVisible(30); }}
        onLangClear={() => { setSelectedLangs(new Set()); setVisible(30); }}
      />

      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-2 gap-2">
          {shown.map(r => (
            <div key={r.id} className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-all ${!r.enabled ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.severity === "error" || r.severity === "ERROR" || r.severity === "HIGH" ? "#ef4444" : r.severity === "warning" || r.severity === "WARNING" || r.severity === "MEDIUM" ? "#eab308" : "#3b82f6" }} />
                <span className="text-xs font-mono text-text-muted truncate flex-1">{r.ruleId}</span>
                {!r.isBuiltin && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600 shrink-0">User</span>}
                <button type="button" onClick={() => r.isBuiltin ? toggleBuiltinRule(r.ruleId) : toggleDbRule(dbRules.find(d => d.id === r.id)!)}
                  className={`w-8 h-4.5 rounded-full shrink-0 transition-colors relative ${r.enabled ? "bg-primary-500" : "bg-secondary-200"}`}>
                  <span className={`absolute top-px w-4 h-4 rounded-full bg-white shadow transition-transform ${r.enabled ? "left-3.5" : "left-px"}`} />
                </button>
              </div>
              <p className="text-sm text-text leading-relaxed">{r.name}</p>
              <p className="text-xs text-text-muted bg-secondary-50 px-2 py-1 rounded line-clamp-2 leading-relaxed">{r.message}</p>
              <div className="flex items-end gap-2">
                <div className="flex flex-wrap gap-1 flex-1">
                  <TechBadge name={r.lang} icon={langIcon[r.lang]} label={r.lang} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditModal({ id: r.id, ruleId: r.ruleId, isBuiltin: r.isBuiltin, path: r.path, yamlContent: r.yamlContent })} className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors" aria-label="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  {!r.isBuiltin && (
                    <button onClick={() => setDeleteId(r.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-danger-500 hover:bg-danger-500/10 transition-colors" aria-label="Delete">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {rules.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-2">{sevFilter || selectedLangs.size || filter ? "No rules match your filters" : "No rules found"}</p>}
        </div>
        {visible < rules.length && (
          <div className="flex justify-center mt-4">
            <button onClick={() => setVisible(v => v + 30)} className="h-9 px-5 text-sm font-medium rounded-lg border border-border text-text-muted hover:bg-secondary-50 hover:text-text transition-colors">
              Load more ({rules.length - visible} remaining)
            </button>
          </div>
        )}
      </div>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} message="Are you sure you want to delete this Semgrep rule?" />

      {/* Edit YAML Modal */}
      <Modal open={!!editRule} onClose={() => setEditRule(null)} title={editRule?.ruleId || "Edit Rule"} size="xl">
        {editLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-5 h-5" /></div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-text-muted font-mono">{editRule?.isBuiltin ? editRule.path : `DB rule: ${editRule?.ruleId}`}</p>
            <YamlEditor value={editContent} onChange={setEditContent} height="600px" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditRule(null)} className="h-9 px-4 text-sm font-medium rounded-lg border border-border text-text-muted hover:bg-secondary-50 transition-colors">Cancel</button>
              <button onClick={handleEditSave} disabled={editSaving} className={`${btnPrimary} disabled:opacity-50`}>{editSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Rule Modal */}
      <Modal open={adding} onClose={onAddingDone} title="Add Semgrep Rule" size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Rule ID</label>
            <input type="text" value={newRuleId} onChange={e => setNewRuleId(e.target.value)} className={inputCls + " font-mono text-xs"} placeholder="custom.my-rule" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Rule YAML</label>
            <YamlEditor value={newRuleContent} onChange={setNewRuleContent} height="400px" />
            <p className="text-xs text-text-muted mt-1">
              Required fields: <code className="text-xs">id</code>, <code className="text-xs">message</code>, <code className="text-xs">severity</code> (WARNING, ERROR, INFO), <code className="text-xs">languages</code>, and one of <code className="text-xs">pattern</code> / <code className="text-xs">patterns</code> / <code className="text-xs">pattern-either</code> / <code className="text-xs">pattern-regex</code>
            </p>
          </div>
          {newRuleError && <p className="text-sm text-danger-500">{newRuleError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onAddingDone} className="h-9 px-4 text-sm font-medium rounded-lg border border-border text-text-muted hover:bg-secondary-50 transition-colors">Cancel</button>
            <button onClick={async () => {
              if (!newRuleId.trim()) { setNewRuleError("Rule ID is required"); return; }
              if (!newRuleContent.trim()) { setNewRuleError("Rule YAML cannot be empty"); return; }
              setNewRuleSaving(true); setNewRuleError("");
              try {
                // Extract severity and message from YAML content
                const sevMatch = newRuleContent.match(/severity:\s*(\S+)/i);
                const msgMatch = newRuleContent.match(/message:\s*>?-?\s*\n?\s*(.+)/i);
                const severity = sevMatch ? sevMatch[1].toLowerCase() : "warning";
                const message = msgMatch ? msgMatch[1].trim() : newRuleId;
                await codeAnalysisApi.createCustomRule({
                  ruleId: newRuleId, severity, message,
                  pattern: "", extensions: [],
                  type: "semgrep", yamlContent: newRuleContent,
                });
                const res = await codeAnalysisApi.listCustomRules("semgrep");
                setDbRules(res.rules);
                onAddingDone();
              } catch (e: unknown) {
                setNewRuleError((e as Error).message || "Failed to save rule");
              } finally { setNewRuleSaving(false); }
            }} disabled={newRuleSaving} className={`${btnPrimary} disabled:opacity-50`}>{newRuleSaving ? "Saving…" : "Create"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
