import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { RepoAnalysis, SensitiveField, Dependency } from "../../../components/DeployWizard";
import MDEditor from "@uiw/react-md-editor";
import { cardCls } from "../../../utils/styles";
import SensitivityBadge, { getSensitivityStyle } from "../../../components/badges/SensitivityBadge";
import { gitApi } from "../../../services/api";

interface Props {
  analysis: RepoAnalysis | null;
  analysisLoading: boolean;
  onRefresh?: () => void;
  projectId?: string;
}

const SECTION_TABS = [
  { key: "overview",     label: "Overview" },
  { key: "howItWorks",   label: "How It Works" },
  { key: "architecture", label: "Architecture" },
  { key: "dataStorage",  label: "Data & Storage" },
  { key: "codeQuality",  label: "Code Quality" },
  { key: "security",     label: "Security" },
  { key: "deployment",   label: "Deployment" },
] as const;

type TabKey = typeof SECTION_TABS[number]["key"] | "sensitiveData" | "dependencies";

// ─── SQL Schema Parser ───

const FRAMEWORK_TABLES = new Set([
  "migrations", "jobs", "failed_jobs", "sessions", "cache", "cache_locks",
  "password_resets", "password_reset_tokens", "personal_access_tokens",
  "oauth_access_tokens", "oauth_auth_codes", "oauth_clients",
  "oauth_personal_access_clients", "oauth_refresh_tokens",
  "telescope_entries", "telescope_entries_tags", "telescope_monitoring",
  "pulse_aggregates", "pulse_entries", "pulse_values",
  "notifications", "job_batches",
]);

const SKIP_FIELDS = new Set([
  "id", "uuid", "ulid", "created_at", "updated_at", "deleted_at",
  "remember_token", "email_verified_at",
]);

type SensitivityLevel = "personal" | "sensitive" | "secret";

const FIELD_PATTERNS: Array<{ pattern: RegExp; sensitivity: SensitivityLevel; reason: string }> = [
  // Secret
  { pattern: /password/i,        sensitivity: "secret",    reason: "Password field" },
  { pattern: /secret/i,          sensitivity: "secret",    reason: "Secret value" },
  { pattern: /token/i,           sensitivity: "secret",    reason: "Authentication token" },
  { pattern: /api_key/i,         sensitivity: "secret",    reason: "API key" },
  { pattern: /private_key/i,     sensitivity: "secret",    reason: "Private key" },
  { pattern: /access_key/i,      sensitivity: "secret",    reason: "Access key" },
  { pattern: /secret_key/i,      sensitivity: "secret",    reason: "Secret key" },
  { pattern: /encryption_key/i,  sensitivity: "secret",    reason: "Encryption key" },
  // Sensitive
  { pattern: /credit_card/i,     sensitivity: "sensitive", reason: "Credit card data" },
  { pattern: /card_number/i,     sensitivity: "sensitive", reason: "Card number" },
  { pattern: /cvv/i,             sensitivity: "sensitive", reason: "CVV code" },
  { pattern: /ssn/i,             sensitivity: "sensitive", reason: "Social Security Number" },
  { pattern: /social_security/i, sensitivity: "sensitive", reason: "Social Security Number" },
  { pattern: /bank_account/i,    sensitivity: "sensitive", reason: "Bank account info" },
  { pattern: /routing_number/i,  sensitivity: "sensitive", reason: "Routing number" },
  { pattern: /salary/i,          sensitivity: "sensitive", reason: "Financial data" },
  { pattern: /income/i,          sensitivity: "sensitive", reason: "Financial data" },
  { pattern: /tax_id/i,          sensitivity: "sensitive", reason: "Tax identifier" },
  { pattern: /passport/i,        sensitivity: "sensitive", reason: "Passport data" },
  { pattern: /driver_license/i,  sensitivity: "sensitive", reason: "Driver license" },
  { pattern: /health/i,          sensitivity: "sensitive", reason: "Health data" },
  { pattern: /medical/i,         sensitivity: "sensitive", reason: "Medical data" },
  { pattern: /diagnosis/i,       sensitivity: "sensitive", reason: "Medical diagnosis" },
  { pattern: /biometric/i,       sensitivity: "sensitive", reason: "Biometric data" },
  // Personal
  { pattern: /email/i,           sensitivity: "personal",  reason: "Email address" },
  { pattern: /phone/i,           sensitivity: "personal",  reason: "Phone number" },
  { pattern: /address/i,         sensitivity: "personal",  reason: "Physical address" },
  { pattern: /street/i,          sensitivity: "personal",  reason: "Street address" },
  { pattern: /city/i,            sensitivity: "personal",  reason: "City" },
  { pattern: /zip_?code/i,       sensitivity: "personal",  reason: "Zip code" },
  { pattern: /postal/i,          sensitivity: "personal",  reason: "Postal code" },
  { pattern: /first_?name/i,     sensitivity: "personal",  reason: "First name" },
  { pattern: /last_?name/i,      sensitivity: "personal",  reason: "Last name" },
  { pattern: /full_?name/i,      sensitivity: "personal",  reason: "Full name" },
  { pattern: /birth_?date/i,     sensitivity: "personal",  reason: "Date of birth" },
  { pattern: /date_of_birth/i,   sensitivity: "personal",  reason: "Date of birth" },
  { pattern: /dob\b/i,           sensitivity: "personal",  reason: "Date of birth" },
  { pattern: /gender/i,          sensitivity: "personal",  reason: "Gender" },
  { pattern: /nationality/i,     sensitivity: "personal",  reason: "Nationality" },
  { pattern: /ethnicity/i,       sensitivity: "personal",  reason: "Ethnicity" },
  { pattern: /religion/i,        sensitivity: "personal",  reason: "Religion" },
  { pattern: /ip_address/i,      sensitivity: "personal",  reason: "IP address" },
  { pattern: /latitude/i,        sensitivity: "personal",  reason: "Location data" },
  { pattern: /longitude/i,       sensitivity: "personal",  reason: "Location data" },
  { pattern: /geo_?location/i,   sensitivity: "personal",  reason: "Geolocation" },
];

function classifyField(field: string): { sensitivity: SensitivityLevel; reason: string } | null {
  for (const { pattern, sensitivity, reason } of FIELD_PATTERNS) {
    if (pattern.test(field)) return { sensitivity, reason };
  }
  return null;
}

function parseSqlSchema(sql: string): SensitiveField[] {
  const results: SensitiveField[] = [];

  // Parse SQL CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|\))/gi;
  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    if (FRAMEWORK_TABLES.has(tableName)) continue;
    const body = match[2];
    const columnRegex = /[`"']?(\w+)[`"']?\s+(?:VARCHAR|CHAR|TEXT|INT|INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|BOOLEAN|BOOL|DATE|DATETIME|TIMESTAMP|TIME|YEAR|BLOB|BINARY|VARBINARY|JSON|JSONB|UUID|SERIAL|ENUM|SET)/gi;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = columnRegex.exec(body)) !== null) {
      const field = colMatch[1];
      if (SKIP_FIELDS.has(field)) continue;
      const classification = classifyField(field);
      if (classification) {
        results.push({ entity: tableName, field, ...classification });
      }
    }
  }

  // Parse Laravel Schema::create PHP migrations
  const laravelRegex = /Schema::create\s*\(\s*['"](\w+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\)/gi;
  while ((match = laravelRegex.exec(sql)) !== null) {
    const tableName = match[1];
    if (FRAMEWORK_TABLES.has(tableName)) continue;
    const body = match[2];
    const colRegex = /\$table->(?:string|text|integer|bigInteger|smallInteger|tinyInteger|decimal|float|double|boolean|date|dateTime|timestamp|time|year|binary|json|jsonb|uuid|enum|char|longText|mediumText)\s*\(\s*['"](\w+)['"]/gi;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = colRegex.exec(body)) !== null) {
      const field = colMatch[1];
      if (SKIP_FIELDS.has(field)) continue;
      const classification = classifyField(field);
      if (classification) {
        results.push({ entity: tableName, field, ...classification });
      }
    }
  }

  return results;
}

// ─── Loading Spinner ───

function TabSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 justify-center">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-text-muted">{label || "Loading…"}</span>
    </div>
  );
}

// ─── AI Sensitive Data Result Type ───

interface AiSensitiveTable {
  name: string;
  riskScore: number;
  columns: Array<{
    name: string;
    type: string;
    category: string;
    sensitivity: string;
    reason: string;
    confidence: number;
  }>;
}

interface AiSensitiveResult {
  tables: AiSensitiveTable[];
  summary: {
    totalTables: number;
    highRiskTables: number;
    criticalFindings: string[];
  };
}

// ─── Dropzone for SQL files ───

function SqlDropzone({ onParsed, onAiResult, projectId }: { onParsed: (data: SensitiveField[]) => void; onAiResult: (data: AiSensitiveResult) => void; projectId?: string }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!file.name.endsWith(".sql")) {
      setError("Only .sql files are accepted");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      // Static parse as fallback
      const staticResults = parseSqlSchema(text);

      // AI analysis (primary)
      setAiLoading(true);
      gitApi.analyzeSensitiveData(text, projectId)
        .then((res) => {
          onAiResult(res);
          // Also convert AI results to SensitiveField format
          const fields: SensitiveField[] = [];
          for (const t of res.tables) {
            for (const c of t.columns) {
              if (c.sensitivity !== "low" && c.category !== "internal" && c.category !== "unknown") {
                const sens = c.sensitivity === "critical" ? "secret" : c.sensitivity === "high" ? "sensitive" : "personal";
                fields.push({ entity: t.name, field: c.name, sensitivity: sens as "personal" | "sensitive" | "secret", reason: c.reason });
              }
            }
          }
          if (fields.length > 0) onParsed(fields);
        })
        .catch((err: unknown) => {
          console.error("[sensitive-ai]", err);
          // Fallback to static results
          if (staticResults.length > 0) {
            onParsed(staticResults);
          } else {
            setError("AI analysis failed and no sensitive fields detected statically.");
          }
        })
        .finally(() => setAiLoading(false));
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  }, [onParsed, onAiResult]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="py-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-primary-500 bg-primary-500/10"
            : "border-border hover:border-primary-500/50 hover:bg-secondary-50/50"
        }`}
      >
        <div className="text-3xl mb-3">📄</div>
        <p className="text-sm font-medium text-text mb-1">Drop your schema.sql here</p>
        <p className="text-xs text-text-muted mb-3">or click to browse</p>
        <p className="text-[11px] text-text-muted">Accepts .sql files</p>
        <input
          ref={inputRef}
          type="file"
          accept=".sql"
          onChange={handleChange}
          className="hidden"
        />
      </div>
      {aiLoading && (
        <div className="flex items-center gap-2 mt-3 justify-center">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-text-muted">AI is analyzing your schema…</span>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-400 mt-2 text-center">{error}</p>
      )}
    </div>
  );
}


// ─── AI Sensitive Data Tab ───

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
  high: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  medium: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  low: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
};

const CATEGORY_LABELS: Record<string, string> = {
  credentials: "🔑 Credentials",
  personal_identifiable: "👤 PII",
  financial: "💳 Financial",
  authentication: "🔐 Auth",
  health: "🏥 Health",
  location: "📍 Location",
  internal: "⚙️ Internal",
  unknown: "❓ Unknown",
};

function AiSensitiveDataTab({ data }: { data: AiSensitiveResult }) {
  const [selectedTable, setSelectedTable] = useState(data.tables[0]?.name || "");
  const table = data.tables.find(t => t.name === selectedTable);

  return (
    <div>
      {/* Summary */}
      {data.summary.criticalFindings.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs font-semibold text-red-400 mb-1">Critical Findings</p>
          <ul className="space-y-0.5">
            {data.summary.criticalFindings.map((f, i) => (
              <li key={i} className="text-xs text-red-300">• {f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 min-h-30">
        {/* Left nav — tables */}
        <div className="w-48 shrink-0 border-r border-border pr-3 space-y-0.5">
          {data.tables.map((t) => {
            const risk = t.riskScore > 80 ? "critical" : t.riskScore > 60 ? "high" : t.riskScore > 30 ? "medium" : "low";
            const rc = RISK_COLORS[risk];
            return (
              <button
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between gap-1 ${
                  selectedTable === t.name
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "text-text-muted hover:text-text hover:bg-secondary-50"
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold ${rc.bg} ${rc.text}`}>{t.riskScore}</span>
              </button>
            );
          })}
        </div>

        {/* Right — columns */}
        <div className="flex-1 min-w-0">
          {table && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-secondary-50 px-3 py-1.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-text">{table.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    RISK_COLORS[table.riskScore > 80 ? "critical" : table.riskScore > 60 ? "high" : table.riskScore > 30 ? "medium" : "low"].bg
                  } ${
                    RISK_COLORS[table.riskScore > 80 ? "critical" : table.riskScore > 60 ? "high" : table.riskScore > 30 ? "medium" : "low"].text
                  }`}>Risk: {table.riskScore}</span>
                  <span className="text-[10px] text-text-muted">{table.columns.length} columns</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                {table.columns.map((c, i) => {
                  const sevColor = RISK_COLORS[c.sensitivity] || RISK_COLORS.low;
                  return (
                    <div key={i} className="flex items-center px-3 py-1.5 gap-2">
                      <span className="text-xs font-mono text-text w-1/4 truncate">{c.name}</span>
                      <span className="text-[10px] text-text-muted w-16 truncate">{c.type}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sevColor.bg} ${sevColor.text}`}>{c.sensitivity}</span>
                      <span className="text-[10px] text-text-muted">{CATEGORY_LABELS[c.category] || c.category}</span>
                      <span className="text-[10px] text-text-muted flex-1 truncate text-right">{c.reason}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sensitive Data Tab ───

function SensitiveDataTab({ data }: { data: SensitiveField[] }) {
  const grouped = data.reduce((acc, f) => {
    (acc[f.entity] = acc[f.entity] || []).push(f);
    return acc;
  }, {} as Record<string, SensitiveField[]>);

  const entities = Object.keys(grouped);
  const [selected, setSelected] = useState(entities[0] || "");

  const fields = grouped[selected] || [];

  return (
    <div>
      <div className="flex gap-3 min-h-30">
        {/* Left nav */}
        <div className="w-44 shrink-0 border-r border-border pr-3 space-y-0.5">
          {entities.map((entity) => {
            const count = grouped[entity].length;
            const hasSecret = grouped[entity].some((f: { sensitivity: string; }) => f.sensitivity === "secret");
            const hasSensitive = grouped[entity].some((f: { sensitivity: string; }) => f.sensitivity === "sensitive");
            const topLevel = hasSecret ? "secret" : hasSensitive ? "sensitive" : "personal";
            const countStyle = getSensitivityStyle(topLevel);
            return (
              <button
                key={entity}
                onClick={() => setSelected(entity)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between gap-1 ${
                  selected === entity
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "text-text-muted hover:text-text hover:bg-secondary-50"
                }`}
              >
                <span className="truncate">{entity}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold ${countStyle.bg} ${countStyle.text}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {selected && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-secondary-50 px-3 py-1.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-text">{selected}</span>
                <span className="text-[10px] text-text-muted">{fields.length} fields</span>
              </div>
              <div className="divide-y divide-border">
                {fields.map((f, i) => (
                    <div key={i} className="flex items-center px-3 py-1.5 gap-2">
                      <span className="text-xs font-mono text-text w-2/5 truncate">{f.field}</span>
                      <span className="text-[11px] text-text-muted flex-1 truncate">{f.reason}</span>
                      <SensitivityBadge level={f.sensitivity} />
                    </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Vulnerability Modal & Dependencies Tab ───

const VULN_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/20", text: "text-red-400" },
  high:     { bg: "bg-orange-500/20", text: "text-orange-400" },
  medium:   { bg: "bg-amber-500/20", text: "text-amber-400" },
  low:      { bg: "bg-blue-500/15", text: "text-blue-400" },
};

type VulnDetail = { id: string; severity: string; title: string; details: string; aliases: string[]; url: string; pkg: string };

function VulnModal({ vuln, onClose }: { vuln: VulnDetail; onClose: () => void }) {
  const vs = VULN_STYLES[vuln.severity] || VULN_STYLES.medium;
  const [details, setDetails] = useState(vuln.details);
  const [aliases, setAliases] = useState(vuln.aliases);
  const [loading, setLoading] = useState(!vuln.details);

  useEffect(() => {
    if (vuln.details) return;
    fetch(`https://api.osv.dev/v1/vulns/${vuln.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setDetails(data.details || data.summary || "");
          setAliases(data.aliases || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vuln.id, vuln.details]);

  return (
    <div className="fixed inset-0 z-99999" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-card rounded-xl border border-border shadow-xl max-w-xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${vs.bg} ${vs.text}`}>{vuln.severity}</span>
                <span className="text-[11px] font-mono text-text-muted">{vuln.id}</span>
              </div>
              <h3 className="text-sm font-semibold text-text leading-snug">{vuln.title}</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Package: {vuln.pkg}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1 scrollbar-hide">
            {loading ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-muted">Loading details…</span>
              </div>
            ) : (
              <>
                {aliases.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Aliases</p>
                    <div className="flex flex-wrap gap-1">
                      {aliases.map(a => <span key={a} className="text-[11px] font-mono text-text-muted bg-secondary-50 border border-border px-1.5 py-0.5 rounded">{a}</span>)}
                    </div>
                  </div>
                )}
                {details ? (
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Details</p>
                    <MDEditor.Markdown source={details} style={{ background: "transparent", color: "inherit", fontSize: "0.75rem" }} />
                  </div>
                ) : (
                  <p className="text-xs text-text-muted py-2">No additional details available.</p>
                )}
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border">
            <a href={`https://osv.dev/vulnerability/${vuln.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:text-primary-400 font-medium transition-colors">
              View on OSV.dev →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function DependenciesTab({ data }: { data: Dependency[] }) {
  const [filter, setFilter] = useState<"all" | "production" | "dev" | "vulnerable">("all");
  const [selectedVuln, setSelectedVuln] = useState<VulnDetail | null>(null);

  const filtered = data.filter(d => {
    if (filter === "production") return d.type === "production";
    if (filter === "dev") return d.type === "dev";
    if (filter === "vulnerable") return d.vulnerabilities.length > 0;
    return true;
  });

  const vulnCount = data.reduce((sum, d) => sum + d.vulnerabilities.length, 0);
  const prodCount = data.filter(d => d.type === "production").length;
  const devCount = data.filter(d => d.type === "dev").length;

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 mb-3">
        {([
          { key: "all", label: `All (${data.length})` },
          { key: "production", label: `Production (${prodCount})` },
          { key: "dev", label: `Dev (${devCount})` },
          { key: "vulnerable", label: `Vulnerable (${vulnCount > 0 ? vulnCount : 0})` },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${
              filter === f.key
                ? f.key === "vulnerable" ? "bg-red-500/20 text-red-400" : "bg-primary-100 text-primary-700"
                : "text-text-muted hover:text-text hover:bg-secondary-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="bg-secondary-50 px-3 py-1.5 border-b border-border flex items-center gap-3 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
          <span className="w-2/5">Package</span>
          <span className="w-[10%]">Version</span>
          <span className="w-[10%]">Latest</span>
          <span className="w-[12%]">Status</span>
          <span className="flex-1">Vulnerabilities</span>
        </div>
        <div className="divide-y divide-border max-h-100 overflow-y-auto scrollbar-hide">
          {filtered.map((d, i) => {
            const hasVulns = d.vulnerabilities.length > 0;
            return (
              <div key={i} className="px-3 py-1.5 flex items-start gap-3 hover:bg-secondary-50/50 transition-colors">
                <div className="w-2/5 min-w-0">
                  <a href={d.repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary-500 hover:text-primary-400 truncate block">{d.name}</a>
                  <span className="text-[10px] text-text-muted">{d.ecosystem} · {d.type}</span>
                </div>
                <span className="text-xs font-mono text-text w-[10%] truncate">{d.version}</span>
                <span className="text-xs font-mono w-[10%] truncate">
                  {d.latestVersion ? (
                    d.latestVersion === d.version
                      ? <span className="text-emerald-400">{d.latestVersion}</span>
                      : <span className="text-amber-400">{d.latestVersion}</span>
                  ) : <span className="text-text-muted">—</span>}
                </span>
                <span className="w-[12%]">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    d.status === "active" ? "bg-emerald-500/15 text-emerald-400" :
                    d.status === "outdated" ? "bg-amber-500/20 text-amber-400" :
                    d.status === "deprecated" ? "bg-red-500/20 text-red-400" :
                    "bg-gray-500/15 text-gray-400"
                  }`}>{d.status}</span>
                </span>
                <div className="flex-1 min-w-0">
                  {hasVulns ? (
                    <div className="flex flex-wrap gap-1">
                      {d.vulnerabilities.slice(0, 3).map((v, vi) => {
                        const vs = VULN_STYLES[v.severity] || VULN_STYLES.medium;
                        return (
                          <button key={vi} onClick={() => setSelectedVuln({ ...v, pkg: d.name })}
                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${vs.bg} ${vs.text} hover:opacity-80 transition-opacity truncate max-w-35 text-left cursor-pointer`}>
                            {v.title || v.id}
                          </button>
                        );
                      })}
                      {d.vulnerabilities.length > 3 && (
                        <span className="text-[9px] text-text-muted">+{d.vulnerabilities.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-muted text-center">No dependencies match this filter.</div>
          )}
        </div>
      </div>
      {selectedVuln && <VulnModal vuln={selectedVuln} onClose={() => setSelectedVuln(null)} />}
    </div>
  );
}

// ─── Main Component ───

export default function ProjectDescription({ analysis, analysisLoading, onRefresh, projectId }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const cacheKey = projectId ? `sensitive:${projectId}` : null;

  const [uploadedSensitiveData, setUploadedSensitiveData] = useState<SensitiveField[] | null>(() => {
    if (!cacheKey) return null;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch { /* ignore */ }
    return null;
  });

  const [aiSensitiveResult, setAiSensitiveResult] = useState<AiSensitiveResult | null>(() => {
    if (!cacheKey) return null;
    try {
      const raw = sessionStorage.getItem(`${cacheKey}:ai`);
      return raw ? JSON.parse(raw) : null;
    } catch { /* ignore */ }
    return null;
  });

  // Load from DB cache if not in sessionStorage
  useEffect(() => {
    if (aiSensitiveResult || !projectId) return;
    // Send empty schema with projectId — backend returns DB cache if exists
    gitApi.analyzeSensitiveData("", projectId)
      .then((res) => {
        if (res.tables && res.tables.length > 0) {
          setAiSensitiveResult(res);
          if (cacheKey) {
            try { sessionStorage.setItem(`${cacheKey}:ai`, JSON.stringify(res)); } catch { /* quota */ }
          }
        }
      })
      .catch(() => { /* no cache, that's fine */ });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSensitiveParsed = (data: SensitiveField[]) => {
    setUploadedSensitiveData(data);
    if (cacheKey) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
    }
  };

  const handleAiResult = (data: AiSensitiveResult) => {
    setAiSensitiveResult(data);
    if (cacheKey) {
      try { sessionStorage.setItem(`${cacheKey}:ai`, JSON.stringify(data)); } catch { /* quota */ }
    }
  };

  const clearSensitiveData = () => {
    setUploadedSensitiveData(null);
    setAiSensitiveResult(null);
    if (cacheKey) {
      try { sessionStorage.removeItem(cacheKey); sessionStorage.removeItem(`${cacheKey}:ai`); } catch { /* ignore */ }
    }
  };

  const dependencies = analysis?.dependencies;

  // Parse sections from AI response, or split description by ## headers as fallback
  const description = analysis?.aiAnalysis?.description;
  const rawSections = analysis?.aiAnalysis?.sections;
  const sections = useMemo(() => {
    if (rawSections) {
      const valid: Record<string, string> = {};
      for (const tab of SECTION_TABS) {
        const val = (rawSections as Record<string, string>)[tab.key];
        if (val && typeof val === "string" && val.length > 10) valid[tab.key] = val;
      }
      if (Object.keys(valid).length >= 3) return valid;
    }
    if (!description) return null;
    const result: Record<string, string> = {};
    const headerMap: Record<string, string> = {
      "overview": "overview", "how it works": "howItWorks",
      "architecture": "architecture", "data & storage": "dataStorage", "data and storage": "dataStorage",
      "code quality": "codeQuality", "code quality & patterns": "codeQuality",
      "security": "security", "security considerations": "security",
      "deployment": "deployment",
    };
    const parts = description.split(/^## /m);
    for (const part of parts) {
      if (!part.trim()) continue;
      const firstLine = part.split("\n")[0].trim().toLowerCase();
      const key = headerMap[firstLine];
      if (key) {
        result[key] = part.split("\n").slice(1).join("\n").trim();
      }
    }
    return Object.keys(result).length >= 2 ? result : null;
  }, [rawSections, description]);

  // Always build the full tab list
  const allTabs: Array<{ key: TabKey; label: string }> = [
    ...SECTION_TABS.map(t => ({ key: t.key as TabKey, label: t.label })),
    { key: "dependencies" as TabKey, label: "Dependencies" },
    { key: "sensitiveData" as TabKey, label: "Sensitive Data" },
  ];

  // Render tab content with per-tab loading
  const renderTabContent = () => {
    // Dependencies tab
    if (activeTab === "dependencies") {
      if (dependencies && dependencies.length > 0) {
        return <DependenciesTab data={dependencies} />;
      }
      if (analysisLoading) {
        return <TabSpinner label="Scanning dependencies…" />;
      }
      return <p className="text-sm text-text-muted py-6 text-center">No dependencies detected.</p>;
    }

    // Sensitive Data tab
    if (activeTab === "sensitiveData") {
      if (aiSensitiveResult || (uploadedSensitiveData && uploadedSensitiveData.length > 0)) {
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {aiSensitiveResult && (
                  <span className="text-xs text-text-muted">
                    {aiSensitiveResult.summary.totalTables} tables · {aiSensitiveResult.summary.highRiskTables} high risk
                  </span>
                )}
                {!aiSensitiveResult && uploadedSensitiveData && (
                  <span className="text-xs text-text-muted">{uploadedSensitiveData.length} sensitive fields detected</span>
                )}
              </div>
              <button onClick={clearSensitiveData} className="text-xs text-primary-500 hover:text-primary-400 transition-colors">
                Upload another file
              </button>
            </div>
            {aiSensitiveResult ? (
              <AiSensitiveDataTab data={aiSensitiveResult} />
            ) : uploadedSensitiveData ? (
              <SensitiveDataTab data={uploadedSensitiveData} />
            ) : null}
          </div>
        );
      }
      return <SqlDropzone onParsed={handleSensitiveParsed} onAiResult={handleAiResult} projectId={projectId} />;
    }

    // AI section tabs
    const sectionKey = activeTab as typeof SECTION_TABS[number]["key"];
    const content = sections?.[sectionKey];
    if (content) {
      return <MDEditor.Markdown source={content} style={{ background: "transparent", color: "inherit", fontSize: "14px" }} />;
    }
    if (analysisLoading) {
      return <TabSpinner label="Analyzing project…" />;
    }
    return <p className="text-sm text-text-muted py-6 text-center">No data available for this section yet.</p>;
  };

  return (
    <div className={`${cardCls} mb-6 overflow-hidden`}>
      <div className="h-1 bg-linear-to-r from-primary-500 via-primary-400 to-primary-300" />

      <div className="px-5 pt-4 pb-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <h2 className="text-lg font-semibold text-text">Project Overview</h2>
          {onRefresh && (
            <button onClick={onRefresh} className="ml-auto p-1.5 rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors" title="Re-analyze project">
              <svg className={`w-4 h-4 ${analysisLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
              </svg>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 overflow-x-auto pb-2 mb-3 border-b border-border scrollbar-none">
          {allTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? tab.key === "sensitiveData" ? "bg-red-500/15 text-red-700 dark:text-red-300"
                  : tab.key === "dependencies" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                  : "bg-primary-500/15 text-primary-700 dark:text-white"
                  : "text-text-muted hover:text-text hover:bg-secondary-50"
              }`}
            >
              {tab.label}
              {tab.key === "sensitiveData" && uploadedSensitiveData && uploadedSensitiveData.length > 0 && (
                <span className="text-[9px] bg-red-200 text-red-700 px-1 rounded-full ml-1">{uploadedSensitiveData.length}</span>
              )}
              {tab.key === "dependencies" && dependencies && dependencies.length > 0 && (
                <span className="text-[9px] bg-blue-200 text-blue-700 px-1 rounded-full ml-1">{dependencies.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {renderTabContent()}
      </div>
    </div>
  );
}