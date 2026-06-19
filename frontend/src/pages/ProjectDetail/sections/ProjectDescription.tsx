import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { RepoAnalysis, SensitiveField, Dependency } from "../../../components/DeployWizard";
import MDEditor from "@uiw/react-md-editor";
import { cardCls, segmentActiveCls, segmentIdleCls } from "../../../utils/styles";
import SensitivityBadge, { getSensitivityStyle } from "../../../components/badges/SensitivityBadge";
import { gitApi } from "../../../services/api";
import type { Project, Provider } from "../../../types";
import OverviewEditor from "./OverviewEditor";
import ProjectDeploymentsTab from "./ProjectDeploymentsTab";
import { usePermissions } from "../../../context/PermissionsContext";

interface Props {
  analysis: RepoAnalysis | null;
  analysisLoading: boolean;
  projectId?: string;
  project: Project;
  providers: Provider[];
  onProjectUpdate: (project: Project) => void;
}

const MAIN_TABS = [
  { key: "overview", label: "Overview" },
  { key: "dependencies", label: "Dependencies" },
  { key: "sensitiveData", label: "Sensitive Data" },
  { key: "deployments", label: "Deployments" },
  { key: "processes", label: "Processes" },
  { key: "commands", label: "Commands" },
  { key: "network", label: "Network" },
  { key: "observe", label: "Observe" },
  { key: "domains", label: "Domains" },
  { key: "settings", label: "Settings" },
] as const;

type MainTabKey = typeof MAIN_TABS[number]["key"];

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

/** One-way password hashes — storing these does not expose recoverable credentials. */
const HASHED_CREDENTIAL_FIELDS =
  /^(password|passwd|passphrase|encrypted_password|password_hash|hashed_password|password_digest|passwd_hash|pass_hash|bcrypt)$/i;

const PLAINTEXT_CREDENTIAL_FIELDS =
  /plain(_)?password|password_(plain|raw|cleartext)|raw_password|cleartext_password/i;

type SensitivityLevel = "personal" | "sensitive" | "secret";

const FIELD_PATTERNS: Array<{ pattern: RegExp; sensitivity: SensitivityLevel; reason: string }> = [
  // Secret (plaintext / recoverable credentials only — hashed passwords are excluded above)
  { pattern: /plain(_)?password|password_(plain|raw|cleartext)|raw_password|cleartext_password/i, sensitivity: "secret", reason: "Plaintext credential storage" },
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
  if (SKIP_FIELDS.has(field)) return null;
  if (HASHED_CREDENTIAL_FIELDS.test(field)) return null;
  if (PLAINTEXT_CREDENTIAL_FIELDS.test(field)) {
    return { sensitivity: "secret", reason: "Plaintext credential storage" };
  }
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
    <div className="flex items-center gap-3 pb-8 justify-center">
      <div className="size-5  border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
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
          const fields: SensitiveField[] = [];
          for (const t of res.tables) {
            for (const c of t.columns) {
              if (c.sensitivity !== "low" && c.category !== "internal" && c.category !== "unknown") {
                const sens = c.sensitivity === "critical" ? "secret" : c.sensitivity === "high" ? "sensitive" : "personal";
                fields.push({ entity: t.name, field: c.name, sensitivity: sens as "personal" | "sensitive" | "secret", reason: c.reason });
              }
            }
          }

          if (res.tables.length > 0) {
            onAiResult(res);
            if (fields.length > 0) onParsed(fields);
          } else if (staticResults.length > 0) {
            onParsed(staticResults);
          } else {
            setError("No sensitive fields were detected in the schema.");
          }
        })
        .catch((err: unknown) => {
          console.error("[sensitive-ai]", err);
          // Fallback to static results
          if (staticResults.length > 0) {
            onParsed(staticResults);
          } else {
            setError("Scan failed and no sensitive fields were detected in the schema.");
          }
        })
        .finally(() => setAiLoading(false));
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  }, [onParsed, onAiResult, projectId]);

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
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-primary-500 bg-primary-500/30"
            : "border-border hover:border-primary-500/50 hover:bg-secondary-50/50"
        }`}
      >
        <div className="text-3xl mb-3">📄</div>
        <p className="text-sm font-medium text-text mb-1">Drop your schema.sql here</p>
        <p className="text-xs text-text-muted mb-3">or click to browse</p>
        <p className="text-[11px] text-text-muted">Accepts .sql files · pattern-based scanner</p>
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
          <div className="size-4  border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-text-muted">Pattern-based scanner is analyzing your schema…</span>
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
  critical: { bg: "bg-red-500/30", text: "text-red-300", border: "border-red-500/45" },
  high: { bg: "bg-orange-500/30", text: "text-orange-300", border: "border-orange-500/45" },
  medium: { bg: "bg-amber-500/30", text: "text-amber-300", border: "border-amber-500/45" },
  low: { bg: "bg-emerald-500/30", text: "text-emerald-300", border: "border-emerald-500/45" },
};

function riskLevelFromScore(score: number): keyof typeof RISK_COLORS {
  if (score > 80) return "critical";
  if (score > 60) return "high";
  if (score > 30) return "medium";
  return "low";
}

function riskBadgeCls(level: string): string {
  const rc = RISK_COLORS[level] ?? RISK_COLORS.low;
  return `rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${rc.bg} ${rc.text} ${rc.border}`;
}

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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Summary */}
      {data.summary.criticalFindings.length > 0 && (
        <div className="mb-3 shrink-0 p-3 rounded-lg bg-red-500/30 border border-red-500/30">
          <p className="text-xs font-semibold text-red-400 mb-1">Critical Findings</p>
          <ul className="space-y-0.5">
            {data.summary.criticalFindings.map((f, i) => (
              <li key={i} className="text-xs text-red-300">• {f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex h-0 min-h-0 flex-1 overflow-hidden gap-3">
        {/* Left nav — tables */}
        <div className="w-48 shrink-0 min-h-0 self-stretch overflow-y-auto overscroll-contain scrollbar-hide border-r border-border pr-3 space-y-0.5">
          {data.tables.map((t) => {
            const risk = riskLevelFromScore(t.riskScore);
            return (
              <button
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between gap-1 ${
                  selectedTable === t.name
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-text-muted hover:text-foreground hover:bg-card/60"
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className={riskBadgeCls(risk)}>{t.riskScore}</span>
              </button>
            );
          })}
        </div>

        {/* Right — columns */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
          {table && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-secondary-50 px-3 py-1.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-text">{table.name}</span>
                <div className="flex items-center gap-2">
                  <span className={riskBadgeCls(riskLevelFromScore(table.riskScore))}>
                    Risk: {table.riskScore}
                  </span>
                  <span className="text-[10px] text-text-muted">{table.columns.length} columns</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                {table.columns.map((c, i) => {
                  const severity = c.sensitivity in RISK_COLORS ? c.sensitivity : "low";
                  return (
                    <div key={i} className="flex items-center px-3 py-1.5 gap-2">
                      <span className="text-xs font-mono text-text w-1/4 truncate">{c.name}</span>
                      <span className="text-[10px] text-text-muted w-16 truncate">{c.type}</span>
                      <span className={riskBadgeCls(severity)}>{c.sensitivity}</span>
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-0 min-h-0 flex-1 overflow-hidden gap-3">
        {/* Left nav */}
        <div className="w-44 shrink-0 min-h-0 self-stretch overflow-y-auto overscroll-contain scrollbar-hide border-r border-border pr-3 space-y-0.5">
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
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-text-muted hover:text-foreground hover:bg-card/60"
                }`}
              >
                <span className="truncate">{entity}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold ${countStyle.bg} ${countStyle.text}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Right content */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
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

const VULN_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-500/30", text: "text-red-300", border: "border-red-500/45" },
  high: { bg: "bg-orange-500/30", text: "text-orange-300", border: "border-orange-500/45" },
  medium: { bg: "bg-amber-500/30", text: "text-amber-300", border: "border-amber-500/45" },
  low: { bg: "bg-blue-500/30", text: "text-blue-300", border: "border-blue-500/45" },
};

const DEP_STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: "bg-emerald-500/30", text: "text-emerald-300", border: "border-emerald-500/45" },
  outdated: { bg: "bg-amber-500/30", text: "text-amber-300", border: "border-amber-500/45" },
  deprecated: { bg: "bg-red-500/30", text: "text-red-300", border: "border-red-500/45" },
};

const DEFAULT_TONE_BADGE = { bg: "bg-gray-500/30", text: "text-gray-300", border: "border-gray-500/45" };

function toneBadgeCls(
  styles: { bg: string; text: string; border: string },
  size: "sm" | "xs" = "sm",
): string {
  const textSize = size === "xs" ? "text-[9px]" : "text-[10px]";
  return `rounded-full border px-1.5 py-0.5 font-semibold shrink-0 ${textSize} ${styles.bg} ${styles.text} ${styles.border}`;
}

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-99999" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-card rounded-xl border border-border shadow-xl max-w-xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${vs.bg} ${vs.text} ${vs.border}`}>{vuln.severity}</span>
                <span className="text-[11px] font-mono text-text-muted">{vuln.id}</span>
              </div>
              <h3 className="text-sm/snug font-semibold text-text ">{vuln.title}</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Package: {vuln.pkg}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors shrink-0">
              <svg className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1 scrollbar-hide">
            {loading ? (
              <div className="flex items-center gap-2 py-4">
                <div className="size-4  border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
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
    </div>,
    document.body,
  );
}

function DependencyRow({
  dependency,
  onSelectVuln,
}: {
  dependency: Dependency;
  onSelectVuln: (vuln: VulnDetail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasVulns = dependency.vulnerabilities.length > 0;
  const hiddenVulnCount = Math.max(0, dependency.vulnerabilities.length - 3);
  const visibleVulns = expanded ? dependency.vulnerabilities : dependency.vulnerabilities.slice(0, 3);

  return (
    <div className="px-3 py-1.5 flex items-start gap-3 hover:bg-secondary-50/50 transition-colors">
      <div className="w-2/5 min-w-0">
        <a href={dependency.repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary-500 hover:text-primary-400 truncate block">{dependency.name}</a>
        <span className="text-[10px] text-text-muted">{dependency.ecosystem} · {dependency.type}</span>
      </div>
      <span className="text-xs font-mono text-text w-[10%] truncate">{dependency.version}</span>
      <span className="text-xs font-mono w-[10%] truncate">
        {dependency.latestVersion ? (
          dependency.latestVersion === dependency.version
            ? <span className="text-emerald-400">{dependency.latestVersion}</span>
            : <span className="text-amber-400">{dependency.latestVersion}</span>
        ) : <span className="text-text-muted">—</span>}
      </span>
      <span className="w-[12%]">
        <span className={toneBadgeCls(DEP_STATUS_STYLES[dependency.status] ?? DEFAULT_TONE_BADGE)}>
          {dependency.status}
        </span>
      </span>
      <div className="flex-1 min-w-0">
        {hasVulns ? (
          <div className="flex flex-wrap items-center gap-1">
            {visibleVulns.map((v, vi) => {
              const vs = VULN_STYLES[v.severity] || VULN_STYLES.medium;
              return (
                <button
                  key={`${v.id}-${vi}`}
                  type="button"
                  onClick={() => onSelectVuln({ ...v, pkg: dependency.name })}
                  className={`${toneBadgeCls(vs, "xs")} hover:brightness-110 transition-[filter] truncate max-w-35 text-left cursor-pointer`}
                >
                  {v.title || v.id}
                </button>
              );
            })}
            {hiddenVulnCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="inline-flex h-5 shrink-0 items-center px-1 text-[10px] font-bold leading-none text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                aria-expanded={expanded}
              >
                {expanded ? "Show less" : `+${hiddenVulnCount} more`}
              </button>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">—</span>
        )}
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filter bar */}
      <div className="mb-3 flex shrink-0 items-center gap-1.5">
        {([
          { key: "all", label: `All (${data.length})` },
          { key: "production", label: `Production (${prodCount})` },
          { key: "dev", label: `Dev (${devCount})` },
          { key: "vulnerable", label: `Vulnerable (${vulnCount > 0 ? vulnCount : 0})` },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] px-2 py-1 rounded-md border font-medium transition-colors ${
              filter === f.key
                ? f.key === "vulnerable"
                  ? "border-danger-500/40 bg-danger-500/15 text-danger-400"
                  : segmentActiveCls
                : `${segmentIdleCls} hover:bg-secondary-50 hover:text-text`
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-secondary-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="w-2/5">Package</span>
          <span className="w-[10%]">Version</span>
          <span className="w-[10%]">Latest</span>
          <span className="w-[12%]">Status</span>
          <span className="flex-1">Vulnerabilities</span>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto scrollbar-hide">
          {filtered.map((d) => (
            <DependencyRow
              key={`${d.name}@${d.version}@${d.type}`}
              dependency={d}
              onSelectVuln={setSelectedVuln}
            />
          ))}
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

export default function ProjectDescription({
  analysis,
  analysisLoading,
  projectId,
  project,
  providers,
  onProjectUpdate,
}: Props) {
  const [activeMainTab, setActiveMainTab] = useState<MainTabKey>("overview");
  const { has, isOwner, loading: permissionsLoading } = usePermissions();
  const canEditOverview = isOwner || has("project:manage");

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

  const renderDependenciesSection = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      {dependencies && dependencies.length > 0 ? (
        <DependenciesTab data={dependencies} />
      ) : analysisLoading ? (
        <TabSpinner label="Scanning dependencies…" />
      ) : (
        <p className="text-sm text-text-muted pb-4 text-center">No dependencies detected.</p>
      )}
    </div>
  );

  const renderSensitiveDataSection = () => (
    ((aiSensitiveResult?.tables.length ?? 0) > 0) || (uploadedSensitiveData && uploadedSensitiveData.length > 0) ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between mb-3">
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
          <button type="button" onClick={clearSensitiveData} className="text-xs text-primary-500 hover:text-primary-400 transition-colors">
            Upload another file
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {aiSensitiveResult && aiSensitiveResult.tables.length > 0 ? (
            <AiSensitiveDataTab data={aiSensitiveResult} />
          ) : uploadedSensitiveData ? (
            <SensitiveDataTab data={uploadedSensitiveData} />
          ) : null}
        </div>
      </div>
    ) : (
      <SqlDropzone onParsed={handleSensitiveParsed} onAiResult={handleAiResult} projectId={projectId} />
    )
  );

  const renderMainTabContent = () => {
    switch (activeMainTab) {
      case "dependencies":
        return renderDependenciesSection();
      case "sensitiveData":
        return renderSensitiveDataSection();
      case "deployments":
        return <ProjectDeploymentsTab project={project} providers={providers} />;
      default:
        return renderMainTabPlaceholder(MAIN_TABS.find((t) => t.key === activeMainTab)?.label ?? "");
    }
  };

  const renderMainTabPlaceholder = (label: string) => (
    <p className="text-sm text-text-muted pb-10 text-center">{label} — coming soon.</p>
  );

  return (
    <div className={`${cardCls} mb-8 overflow-hidden`}>
      <div className="h-1 bg-linear-to-r from-primary-500 via-primary-400 to-primary-300" />

      <div className="flex h-[600px] flex-col overflow-hidden px-5 pt-4 pb-5">
        {/* Main tab nav */}
        <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-border mb-4">
          <div className="flex min-h-11 flex-1 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden scrollbar-none">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveMainTab(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 p-3  text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeMainTab === tab.key
                    ? tab.key === "sensitiveData"
                      ? "border-red-500 text-text"
                      : tab.key === "dependencies"
                        ? "border-blue-500 text-text"
                        : "border-primary-500 text-text"
                    : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {tab.label}
                {tab.key === "dependencies" && dependencies && dependencies.length > 0 && (
                  <span className="rounded-full border border-blue-500/40 bg-blue-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400">
                    {dependencies.length}
                  </span>
                )}
                {tab.key === "sensitiveData" && uploadedSensitiveData && uploadedSensitiveData.length > 0 && (
                  <span className="rounded-full border border-red-500/40 bg-red-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                    {uploadedSensitiveData.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              className={
                activeMainTab === "overview"
                  ? "flex min-h-0 flex-1 flex-col pl-0 pr-2"
                  : "hidden"
              }
            >
              {permissionsLoading ? (
                <TabSpinner label="Loading overview…" />
              ) : (
                <OverviewEditor
                  project={project}
                  editable={canEditOverview}
                  onProjectUpdate={onProjectUpdate}
                />
              )}
            </div>
            {activeMainTab !== "overview" && (
              <div className="flex min-h-0 flex-1 flex-col">
                {renderMainTabContent()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}