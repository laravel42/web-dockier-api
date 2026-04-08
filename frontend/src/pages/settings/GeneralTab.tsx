import { useState, useEffect } from "react";
import { gitApi } from "../../services/api";
import { inputCls, btnPrimary } from "./shared";

export default function GeneralTab() {
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [scanTools, setScanTools] = useState<Record<string, boolean>>(() => {
    const savedTools = localStorage.getItem("scan_tools");
    if (savedTools) { try { return JSON.parse(savedTools); } catch { /* ignore */ } }
    return { opengrep: true, sonarqube: true, customRules: true };
  });
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("bedrock_default_model") || "");

  useEffect(() => {
    // Fetch available models
    gitApi.listBedrockModels()
      .then((res) => setModels(res.models))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    localStorage.setItem("bedrock_default_model", selectedModel);
    localStorage.setItem("scan_tools", JSON.stringify(scanTools));
    setMessage("Settings saved");
    setSaving(false);
    setTimeout(() => setMessage(""), 2000);
  };

  const toggleTool = (key: string) => setScanTools(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-6 max-w-lg">
      {message && <div className="p-3 rounded-[var(--radius-btn)] bg-primary-50 text-primary-600 text-sm" role="status">{message}</div>}

      {/* Default LLM */}
      <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
        <h2 className="text-base font-semibold text-text mb-1">Default LLM</h2>
        <p className="text-sm text-text-secondary mb-4">Amazon Bedrock model used for AI features (security fixes, code analysis).</p>
        <div>
          <label htmlFor="default-model" className="block text-sm font-medium text-text-secondary mb-1.5">Bedrock Model</label>
          {loading ? (
            <div className="flex items-center gap-2 h-11">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-muted">Loading models...</span>
            </div>
          ) : models.length > 0 ? (
            <select id="default-model" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={inputCls}>
              <option value="">Select a model</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-text-muted py-2">Could not load models. Make sure the BedrockApiKey secret is configured.</p>
          )}
        </div>
      </div>

      {/* Security Scan Tools */}
      <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
        <h2 className="text-base font-semibold text-text mb-1">Security Scan Tools</h2>
        <p className="text-sm text-text-secondary mb-4">Select which engines run during security scans.</p>
        <div className="space-y-3">
          {([
            { key: "opengrep", name: "Opengrep", desc: "Open-source static analysis with community rules", icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg> },
            { key: "sonarqube", name: "SonarQube", desc: "Enterprise code quality and security analysis", icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Zm0 13.036h.008v.008H12v-.008Z" /></svg> },
            { key: "customRules", name: "Custom Rules", desc: "Your regex-based rules from Settings → Security Rules", icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg> },
          ] as const).map(({ key, name, desc, icon }) => (
            <button key={key} type="button" onClick={() => toggleTool(key)}
              className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all text-left ${
                scanTools[key] ? "border-primary-500 bg-primary-50/50" : "border-border hover:border-primary-300"
              }`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${scanTools[key] ? "text-primary-500 bg-primary-100" : "text-text-muted bg-secondary-50"}`}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${scanTools[key] ? "text-text" : "text-text-muted"}`}>{name}</p>
                <p className="text-xs text-text-muted">{desc}</p>
              </div>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                scanTools[key] ? "bg-primary-500 border-primary-500" : "border-border"
              }`}>
                {scanTools[key] && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !selectedModel} className={`${btnPrimary} disabled:opacity-50`}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
