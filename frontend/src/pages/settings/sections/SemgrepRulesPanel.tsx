import { useState, useEffect } from "react";
import { codeAnalysisApi } from "@/services/api";
import TechBadge from "@/components/TechBadge";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import YamlEditor from "@/components/YamlEditor";
import { SettingsField, SettingsTextField } from "@/components/SettingsField";
import PageLoading from "@/components/ui/PageLoading";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { SquarePenIcon, Trash2Icon } from "lucide-react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { settingsBadgeCls } from "@/utils/styles";
import RulesFilterSidebar from "./RulesFilterSidebar";
import { severityDotCls } from "./shared";

interface SemgrepDbRule {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  yamlContent: string;
  enabled: boolean;
  isSystem: boolean;
  createdAt: string;
}

let _ogCache: Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }> | null = null;

interface Props {
  filter: string;
  adding: boolean;
  onAddingDone: () => void;
}

export default function SemgrepRulesPanel({ filter, adding, onAddingDone }: Props) {
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
  }, [SEMGREP_TEMPLATE, adding]);

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
    clojure: "clojure", ocaml: "ocaml", apex: "apex", generic: "generic", sql: "sql",
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

  if (loading) return <PageLoading />;
  if (error) return <div className="bg-card rounded-xl border border-border p-6 text-center"><p className="text-sm text-danger-500">{error}</p></div>;

  return (
    <div className="flex gap-4">
      <RulesFilterSidebar
        severities={[
          { key: "error", label: "Error", count: sevCounts.error, color: "text-danger-500" },
          { key: "warning", label: "Warning", count: sevCounts.warning, color: "text-warning-500" },
          { key: "info", label: "Info", count: sevCounts.info, color: "text-primary-500" },
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
                <span className={`size-2.5 rounded-full shrink-0 ${severityDotCls(r.severity)}`} />
                <span className="text-xs font-mono text-text-muted truncate flex-1">{r.ruleId}</span>
                {!r.isBuiltin && <span className={settingsBadgeCls.primary}>User</span>}
                <ToggleSwitch checked={r.enabled} onChange={() => r.isBuiltin ? toggleBuiltinRule(r.ruleId) : toggleDbRule(dbRules.find(d => d.id === r.id)!)} />
              </div>
              <p className="text-sm/relaxed text-text">{r.name}</p>
              <p className="text-xs/relaxed text-text-muted bg-secondary-500/10 px-2 py-1 rounded line-clamp-2">{r.message}</p>
              <div className="flex items-end gap-2">
                <div className="flex flex-wrap gap-1 flex-1">
                  <TechBadge name={r.lang} icon={langIcon[r.lang]} label={r.lang} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditModal({ id: r.id, ruleId: r.ruleId, isBuiltin: r.isBuiltin, path: r.path, yamlContent: r.yamlContent })} className="size-7 flex items-center justify-center rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-500/10 transition-colors" aria-label="Edit">
                    <SquarePenIcon className="size-3.5" />
                  </button>
                  {!r.isBuiltin && (
                    <button onClick={() => setDeleteId(r.id)} className="size-7 flex items-center justify-center rounded-md text-text-muted hover:text-danger-500 hover:bg-danger-500/10 transition-colors" aria-label="Delete">
                      <Trash2Icon className="size-3.5" />
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
            <Button variant="outline" onClick={() => setVisible(v => v + 30)}>
              Load more ({rules.length - visible} remaining)
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} message="Are you sure you want to delete this Semgrep rule?" />

      {/* Edit YAML Modal */}
      <Modal open={!!editRule} onClose={() => setEditRule(null)} title={editRule?.ruleId || "Edit Rule"} size="xl">
        {editLoading ? (
          <div className="flex justify-center py-12"><Spinner className="size-5" /></div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-text-muted font-mono">{editRule?.isBuiltin ? editRule.path : `DB rule: ${editRule?.ruleId}`}</p>
            <YamlEditor value={editContent} onChange={setEditContent} height="600px" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRule(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={editSaving} loading={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Rule Modal */}
      <Modal open={adding} onClose={onAddingDone} title="Add Semgrep Rule" size="xl">
        <div className="space-y-4">
          <SettingsTextField id="semgrep-rule-id" label="Rule ID" type="text" value={newRuleId} onChange={e => setNewRuleId(e.target.value)} className="font-mono text-xs" placeholder="custom.my-rule" required />
          <SettingsField label="Rule YAML">
            <YamlEditor value={newRuleContent} onChange={setNewRuleContent} height="400px" />
            <p className="text-xs text-text-muted mt-1">
              Required fields: <code className="text-xs">id</code>, <code className="text-xs">message</code>, <code className="text-xs">severity</code> (WARNING, ERROR, INFO), <code className="text-xs">languages</code>, and one of <code className="text-xs">pattern</code> / <code className="text-xs">patterns</code> / <code className="text-xs">pattern-either</code> / <code className="text-xs">pattern-regex</code>
            </p>
          </SettingsField>
          {newRuleError && <p className="text-sm text-danger-500">{newRuleError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onAddingDone}>Cancel</Button>
            <Button onClick={async () => {
              if (!newRuleId.trim()) { setNewRuleError("Rule ID is required"); return; }
              if (!newRuleContent.trim()) { setNewRuleError("Rule YAML cannot be empty"); return; }
              setNewRuleSaving(true); setNewRuleError("");
              try {
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
            }} disabled={newRuleSaving} loading={newRuleSaving}>{newRuleSaving ? "Saving…" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
