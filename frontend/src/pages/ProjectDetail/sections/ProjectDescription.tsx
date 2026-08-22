import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import type { RepoAnalysis, SensitiveField, Dependency } from "@/components/DeployWizard";
import type { Scan } from "@/types/scan";
import {
  dependencyAlarm,
  isRuntimeTabVisible,
  securityAlarm,
  sensitiveDataAlarm,
  type Alarm,
} from "../navAlarms";
import type { Deployment } from "@/types";
import MDEditor from "@uiw/react-md-editor";
import { cardCls, segmentActiveCls, segmentIdleCls } from "@/utils/styles";
import SensitivityBadge, { getSensitivityStyle } from "@/components/badges/SensitivityBadge";
import { gitApi } from "@/services/api";
import type { Project } from "@/types";
import OverviewEditor from "./OverviewEditor";
import ProjectCommandsTab from "./ProjectCommandsTab";
import ProjectProcessesTab from "./ProjectProcessesTab";
import ProjectNetworkTab from "./ProjectNetworkTab";
import ProjectObserveTab from "./ProjectObserveTab";
import ProjectDomainsTab from "./ProjectDomainsTab";
import ProjectSettingsTab from "./ProjectSettingsTab";
import { usePermissions } from "@/context/PermissionsContext";
import { panelId, tabId, useTabListKeyboard } from "@/hooks/useTabListKeyboard";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { FileTextIcon, XIcon, KeyRoundIcon, UserIcon, CreditCardIcon, LockKeyholeIcon, HeartPulseIcon, MapPinIcon, SettingsIcon, CircleHelpIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import Button from "@/components/ui/Button";

interface Props {
  analysis: RepoAnalysis | null;
  analysisLoading: boolean;
  /** Latest scans — sources the Security alarm count. */
  recentScans?: Scan[];
  /** Deploy history — gates the Runtime cluster on ever having shipped. */
  recentDeploys?: Deployment[];
  projectId?: string;
  project: Project;
  onProjectUpdate: (project: Project) => void;
  /** Commits, contributors, issues and pull requests. */
  activityPanel?: ReactNode;
  /** Recent security scans. */
  securityPanel?: ReactNode;
  /** Deploy history timeline for the deployments tab. */
  deploysPanel?: ReactNode;
}

/**
 * Five clusters, decided in docs/delivery/project-detail-ia.md. Twelve equal nouns
 * in a column are still twelve equal nouns; the grouping is what gives the nav a
 * point of view. Order within MAIN_TABS is the tab order, so arrow-key traversal
 * runs top to bottom across group boundaries without special handling.
 */
const CLUSTERS = [
  { key: "understand", label: "Understand" },
  { key: "risk", label: "Risk" },
  { key: "ship", label: "Ship" },
  { key: "runtime", label: "Runtime" },
  { key: "configure", label: "Configure" },
] as const;

type ClusterKey = typeof CLUSTERS[number]["key"];

/** Written out in full: Tailwind cannot see `border-${tone}-line`. */
const ALARM_TONE = {
  danger: "border-danger-line bg-danger-surface text-danger-ink",
  caution: "border-caution-line bg-caution-surface text-caution-ink",
  warning: "border-warning-line bg-warning-surface text-warning-ink",
} as const;

const MAIN_TABS = [
  { key: "overview", label: "Overview", cluster: "understand" },
  { key: "activity", label: "Activity", cluster: "understand" },
  { key: "security", label: "Security", cluster: "risk" },
  { key: "sensitiveData", label: "Sensitive Data", cluster: "risk" },
  { key: "dependencies", label: "Dependencies", cluster: "risk" },
  { key: "deployments", label: "Deployments", cluster: "ship" },
  { key: "commands", label: "Commands", cluster: "ship" },
  { key: "processes", label: "Processes", cluster: "runtime" },
  { key: "network", label: "Network", cluster: "runtime" },
  { key: "domains", label: "Domains", cluster: "runtime" },
  { key: "observe", label: "Observe", cluster: "runtime" },
  { key: "settings", label: "Settings", cluster: "configure" },
] as const satisfies ReadonlyArray<{ key: string; label: string; cluster: ClusterKey }>;

type MainTabKey = typeof MAIN_TABS[number]["key"];

function isMainTabVisible(
  key: MainTabKey,
  has: (permission: string) => boolean,
  isOwner: boolean,
  runtimeVisible: boolean,
): boolean {
  // Processes, Network, Domains and Observe describe a running server. On a
  // repository that has never deployed they are four dead ends, so the whole
  // Runtime cluster stays out of the nav until there is a runtime to describe.
  if (!runtimeVisible) return false;

  switch (key) {
    case "overview":
    case "activity":
    case "dependencies":
    case "sensitiveData":
    case "processes":
    case "commands":
    case "network":
    case "observe":
    case "domains":
      return has("project:view");
    case "security":
      return has("scan:view");
    case "deployments":
      return has("deploy:view");
    case "settings":
      return isOwner || has("project:manage");
    default:
      return false;
  }
}

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
      {/* A real button, not a div: this is the only way to start a sensitive-data
          scan, and as a div over a display:none input it was unreachable by
          keyboard and announced as nothing by a screen reader. */}
      <button
        type="button"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full border-2 border-dashed rounded-card p-10 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-primary-500 bg-primary-500/10"
            : "border-border hover:border-primary-500/50 hover:bg-secondary-50/50"
        }`}
      >
        <FileTextIcon className="mx-auto mb-3 size-7 text-text-muted" aria-hidden />
        <p className="text-sm font-medium text-text mb-1">Drop your schema.sql here</p>
        <p className="text-xs text-text-muted mb-3">or click to browse</p>
        <p className="text-xs text-text-muted">Accepts .sql files</p>
        <input
          ref={inputRef}
          type="file"
          accept=".sql"
          onChange={handleChange}
          className="sr-only"
          tabIndex={-1}
        />
      </button>
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
  critical: { bg: "bg-danger-surface", text: "text-danger-ink", border: "border-danger-line" },
  high: { bg: "bg-caution-surface", text: "text-caution-ink", border: "border-caution-line" },
  medium: { bg: "bg-warning-surface", text: "text-warning-ink", border: "border-warning-line" },
  low: { bg: "bg-info-surface", text: "text-info-ink", border: "border-info-line" },
};

function riskLevelFromScore(score: number): keyof typeof RISK_COLORS {
  if (score > 80) return "critical";
  if (score > 60) return "high";
  if (score > 30) return "medium";
  return "low";
}

function riskBadgeCls(level: string): string {
  const rc = RISK_COLORS[level] ?? RISK_COLORS.low;
  return `rounded-sm border px-1.5 py-0.5 text-xs font-semibold shrink-0 ${rc.bg} ${rc.text} ${rc.border}`;
}

const CATEGORY_LABELS: Record<string, { icon: typeof KeyRoundIcon; label: string }> = {
  credentials: { icon: KeyRoundIcon, label: "Credentials" },
  personal_identifiable: { icon: UserIcon, label: "PII" },
  financial: { icon: CreditCardIcon, label: "Financial" },
  authentication: { icon: LockKeyholeIcon, label: "Auth" },
  health: { icon: HeartPulseIcon, label: "Health" },
  location: { icon: MapPinIcon, label: "Location" },
  internal: { icon: SettingsIcon, label: "Internal" },
  unknown: { icon: CircleHelpIcon, label: "Unknown" },
};

function AiSensitiveDataTab({ data }: { data: AiSensitiveResult }) {
  const [selectedTable, setSelectedTable] = useState(data.tables[0]?.name || "");
  const table = data.tables.find(t => t.name === selectedTable);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Summary */}
      {data.summary.criticalFindings.length > 0 && (
        <div className="mb-3 shrink-0 p-3 rounded-lg bg-danger-surface border border-danger-line">
          <p className="text-xs font-semibold text-danger-ink mb-1">Critical Findings</p>
          <ul className="space-y-0.5">
            {data.summary.criticalFindings.map((f, i) => (
              <li key={i} className="text-xs text-danger-ink">• {f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-col gap-3 md:h-0 md:flex-1 md:flex-row md:overflow-hidden">
        {/* Left nav — tables */}
        <div className="max-h-40 shrink-0 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide border-b border-border pb-2 space-y-0.5 md:max-h-none md:self-stretch md:border-b-0 md:border-r md:pb-0 md:pr-3 md:w-48">
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
                  <span className="text-xs text-text-muted">{table.columns.length} columns</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                {table.columns.map((c, i) => {
                  const severity = c.sensitivity in RISK_COLORS ? c.sensitivity : "low";
                  return (
                    <div key={i} className="flex items-center px-3 py-1.5 gap-2">
                      <span className="text-xs font-mono text-text w-1/4 truncate">{c.name}</span>
                      <span className="text-xs text-text-muted w-16 truncate">{c.type}</span>
                      <span className={riskBadgeCls(severity)}>{c.sensitivity}</span>
                      <span className="text-xs text-text-muted inline-flex items-center gap-1">{(() => { const cat = CATEGORY_LABELS[c.category]; if (!cat) return c.category; const CatIcon = cat.icon; return <><CatIcon className="size-3" />{cat.label}</>; })()}</span>
                      <span className="text-xs text-text-muted flex-1 truncate text-right">{c.reason}</span>
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
      <div className="flex min-h-0 flex-col gap-3 md:h-0 md:flex-1 md:flex-row md:overflow-hidden">
        {/* Left nav */}
        <div className="max-h-40 shrink-0 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide border-b border-border pb-2 space-y-0.5 md:max-h-none md:self-stretch md:border-b-0 md:border-r md:pb-0 md:pr-3 md:w-44">
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
                <span className={`text-xs px-1.5 py-0.5 rounded-sm shrink-0 font-semibold ${countStyle.bg} ${countStyle.text}`}>{count}</span>
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
                <span className="text-xs text-text-muted">{fields.length} fields</span>
              </div>
              <div className="divide-y divide-border">
                {fields.map((f, i) => (
                    <div key={i} className="flex items-center px-3 py-1.5 gap-2">
                      <span className="text-xs font-mono text-text w-2/5 truncate">{f.field}</span>
                      <span className="text-xs text-text-muted flex-1 truncate">{f.reason}</span>
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
  critical: { bg: "bg-danger-surface", text: "text-danger-ink", border: "border-danger-line" },
  high: { bg: "bg-caution-surface", text: "text-caution-ink", border: "border-caution-line" },
  medium: { bg: "bg-warning-surface", text: "text-warning-ink", border: "border-warning-line" },
  low: { bg: "bg-info-surface", text: "text-info-ink", border: "border-info-line" },
};

const DEP_STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: "bg-success-surface", text: "text-success-ink", border: "border-success-line" },
  outdated: { bg: "bg-warning-surface", text: "text-warning-ink", border: "border-warning-line" },
  deprecated: { bg: "bg-danger-surface", text: "text-danger-ink", border: "border-danger-line" },
};

const DEFAULT_TONE_BADGE = { bg: "bg-secondary-500/30", text: "text-text-secondary", border: "border-border" };

function toneBadgeCls(
  styles: { bg: string; text: string; border: string },
  size: "sm" | "xs" = "sm",
): string {
  const textSize = size === "xs" ? "text-xs" : "text-xs";
  return `rounded-sm border px-1.5 py-0.5 font-semibold shrink-0 ${textSize} ${styles.bg} ${styles.text} ${styles.border}`;
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
      {/* Mouse-only dismissal; Escape closes this surface as well. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-card rounded-xl border border-border shadow-(--shadow-overlay) max-w-xl w-full max-h-[80vh] flex flex-col">
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm border ${vs.bg} ${vs.text} ${vs.border}`}>{vuln.severity}</span>
                <span className="text-xs font-mono text-text-muted">{vuln.id}</span>
              </div>
              <h3 className="text-sm/snug font-semibold text-text ">{vuln.title}</h3>
              <p className="text-xs text-text-muted mt-0.5">Package: {vuln.pkg}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors shrink-0">
              <XIcon className="size-4" />
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
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Aliases</p>
                    <div className="flex flex-wrap gap-1">
                      {aliases.map(a => <span key={a} className="text-xs font-mono text-text-muted bg-secondary-50 border border-border px-1.5 py-0.5 rounded">{a}</span>)}
                    </div>
                  </div>
                )}
                {details ? (
                  <div>
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Details</p>
                    <MDEditor.Markdown source={details} style={{ background: "transparent", color: "inherit", fontSize: "0.875rem" }} />
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
        <span className="text-xs text-text-muted">{dependency.ecosystem} · {dependency.type}</span>
      </div>
      <span className="text-xs font-mono text-text w-[10%] truncate">{dependency.version}</span>
      <span className="text-xs font-mono w-[10%] truncate">
        {dependency.latestVersion ? (
          dependency.latestVersion === dependency.version
            ? <span className="text-success-ink">{dependency.latestVersion}</span>
            : <span className="text-warning-ink">{dependency.latestVersion}</span>
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
                className="inline-flex h-5 shrink-0 items-center px-1 text-xs font-bold leading-none text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                aria-expanded={expanded}
              >
                {expanded ? "Show less" : `+${hiddenVulnCount} more`}
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </div>
    </div>
  );
}

function DependenciesTab({ data }: { data: Dependency[] }) {
  const [filter, setFilter] = useState<"all" | "production" | "dev" | "vulnerable" | "outdated">("all");
  const [selectedVuln, setSelectedVuln] = useState<VulnDetail | null>(null);

  const filtered = data.filter(d => {
    if (filter === "production") return d.type === "production";
    if (filter === "dev") return d.type === "dev";
    if (filter === "vulnerable") return d.vulnerabilities.length > 0;
    if (filter === "outdated") return d.status === "outdated";
    return true;
  });

  const vulnCount = data.reduce((sum, d) => sum + d.vulnerabilities.length, 0);
  const outdatedCount = data.filter(d => d.status === "outdated").length;
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
          { key: "outdated", label: `Outdated (${outdatedCount})` },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-2 py-1 rounded-md border font-medium transition-colors ${
              filter === f.key
                ? f.key === "vulnerable"
                  ? "border-danger-500/40 bg-danger-500/15 text-danger-400"
                  : f.key === "outdated"
                    ? "border-warning-500/40 bg-warning-500/15 text-warning-ink"
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
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-secondary-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
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
  recentScans,
  recentDeploys,
  projectId,
  project,
  onProjectUpdate,
  activityPanel,
  securityPanel,
  deploysPanel,
}: Props) {
  // The tab strip is a sidebar at md+ and a horizontal scroller below it, so the
  // announced orientation has to track the breakpoint. The keyboard handler
  // accepts both axes either way.
  const isSidebar = useIsMdUp();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeMainTab: MainTabKey = MAIN_TABS.some((t) => t.key === tabParam)
    ? (tabParam as MainTabKey)
    : "overview";

  const setActiveMainTab = useCallback(
    (key: MainTabKey, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", key);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );
  const { has, isOwner, loading: permissionsLoading } = usePermissions();
  const canEditOverview = isOwner || has("project:manage");

  const tabListRef = useRef<HTMLDivElement>(null);
  const overviewClipRef = useRef<HTMLDivElement>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [overviewClipPx, setOverviewClipPx] = useState<number | null>(null);
  const [overviewOverflows, setOverviewOverflows] = useState(true);

  const visibleMainTabs = useMemo(() => {
    if (permissionsLoading) return [];
    return MAIN_TABS.filter((tab) =>
      isMainTabVisible(tab.key, has, isOwner, isRuntimeTabVisible(tab.key, recentDeploys)),
    );
  }, [has, isOwner, permissionsLoading, recentDeploys]);

  const visibleMainTabKeys = useMemo(() => visibleMainTabs.map((t) => t.key), [visibleMainTabs]);
  const handleMainTabKeyDown = useTabListKeyboard(visibleMainTabKeys, setActiveMainTab, "both");

  const activeMainTabSafe = visibleMainTabs.some((t) => t.key === activeMainTab)
    ? activeMainTab
    : (visibleMainTabs[0]?.key ?? "overview");

  // A deep link can select a tab that sits outside the visible scroll area —
  // on a phone the strip shows ~3 of twelve. Bring it into view without
  // scrolling the page itself.
  useEffect(() => {
    const el = tabListRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(activeMainTabSafe))}`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeMainTabSafe]);

  useEffect(() => {
    if (!permissionsLoading && !visibleMainTabs.some((t) => t.key === activeMainTab)) {
      setActiveMainTab(visibleMainTabs[0]?.key ?? "overview", true);
    }
  }, [activeMainTab, visibleMainTabs, permissionsLoading, setActiveMainTab]);

  const cacheKey = projectId ? `sensitive:${projectId}` : null;

  useEffect(() => {
    setOverviewExpanded(false);
  }, [project.id]);

  // Clip the overview at the Settings tab's top so a long README cannot stretch
  // the card thousands of pixels. On the horizontal (mobile) strip Settings sits
  // above the panel, so the delta is useless — fall back to a preview height.
  useLayoutEffect(() => {
    if (activeMainTabSafe !== "overview") return;

    const panel = overviewClipRef.current;
    if (!panel) return;

    const measure = () => {
      const foldEl =
        document.getElementById(tabId("settings")) ??
        tabListRef.current?.querySelector<HTMLElement>('[role="tab"]:last-of-type');
      const panelRect = panel.getBoundingClientRect();
      let clipPx =
        isSidebar && foldEl
          ? Math.round(foldEl.getBoundingClientRect().top - panelRect.top)
          : 360;

      if (clipPx < 160) clipPx = 360;

      const editor = panel.querySelector<HTMLElement>(".overview-editor");
      const styles = getComputedStyle(panel);
      const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const natural = editor?.scrollHeight ?? panel.scrollHeight;
      setOverviewClipPx(clipPx);
      setOverviewOverflows(natural > clipPx - padY + 24);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(panel);

    const watchEditor = () => {
      const editor = panel.querySelector(".overview-editor");
      if (editor) ro.observe(editor);
    };
    watchEditor();

    const mo = new MutationObserver(() => {
      watchEditor();
      measure();
    });
    mo.observe(panel, { childList: true, subtree: true });

    measure();
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeMainTabSafe, overviewExpanded, isSidebar, visibleMainTabs, project.id]);

  const clipOverview =
    activeMainTabSafe === "overview" && !overviewExpanded && overviewOverflows;
  const overviewMaxHeight = clipOverview
    ? (overviewClipPx ?? (isSidebar ? 520 : 360))
    : undefined;

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

  // Rules live in navAlarms.ts so they are testable without mounting this surface.
  const tabAlarms = useMemo(
    (): Partial<Record<MainTabKey, Alarm>> => ({
      security: securityAlarm(recentScans) ?? undefined,
      sensitiveData: sensitiveDataAlarm(uploadedSensitiveData) ?? undefined,
      dependencies: dependencyAlarm(dependencies) ?? undefined,
    }),
    [recentScans, uploadedSensitiveData, dependencies],
  );

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
    switch (activeMainTabSafe) {
      case "dependencies":
        return renderDependenciesSection();
      case "sensitiveData":
        return renderSensitiveDataSection();
      case "activity":
        return activityPanel ?? renderMainTabPlaceholder("Activity");
      case "security":
        return securityPanel ?? renderMainTabPlaceholder("Security");
      case "deployments":
        return deploysPanel ?? renderMainTabPlaceholder("Deployments");
      case "processes":
        return <ProjectProcessesTab project={project} />;
      case "commands":
        return <ProjectCommandsTab project={project} />;
      case "network":
        return <ProjectNetworkTab project={project} />;
      case "observe":
        return <ProjectObserveTab project={project} />;
      case "domains":
        return <ProjectDomainsTab project={project} />;
      case "settings":
        return <ProjectSettingsTab project={project} onProjectUpdate={onProjectUpdate} />;
      default:
        return renderMainTabPlaceholder(MAIN_TABS.find((t) => t.key === activeMainTabSafe)?.label ?? "");
    }
  };

  const renderMainTabPlaceholder = (label: string) => (
    <p className="text-sm text-text-muted pb-10 text-center">{label} — coming soon.</p>
  );

  return (
    <div className={`${cardCls} mb-8`}>

      <div className="flex min-h-[420px] flex-col md:min-h-[600px] md:flex-row">
        {/*
          Tab nav as a sidebar. Twelve peers never fit a horizontal strip — they
          overflowed behind a mask with no affordance, hiding Security and
          Settings, the two highest-stakes destinations. A column shows all of
          them at once and scrolls independently of the panel beside it.
          Below md it becomes a scrolling strip, since twelve stacked rows would
          push content ~430px down a phone.
        */}
        <div className="shrink-0 border-b border-border md:w-52 md:self-stretch md:border-b-0 md:border-r">
          <div className="md:sticky md:top-0 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:overscroll-contain md:scrollbar-hide">
            <div
              ref={tabListRef}
              className="flex items-stretch gap-0.5 overflow-x-auto overflow-y-hidden p-2 scrollbar-hide mask-[linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] md:flex-col md:overflow-x-visible md:mask-none"
              role="tablist"
              aria-orientation={isSidebar ? "vertical" : "horizontal"}
              aria-label="Project sections"
            >
            {CLUSTERS.map((cluster) => {
              const tabs = visibleMainTabs.filter((t) => t.cluster === cluster.key);
              if (tabs.length === 0) return null;
              return (
                /*
                  role="presentation" keeps the wrapper out of the accessibility tree,
                  so the tablist still owns its tabs directly — ARIA has no notion of a
                  group inside a tablist. `contents` collapses the wrapper on mobile so
                  the buttons stay in the scrolling row.
                */
                <div key={cluster.key} role="presentation" className="contents md:mb-3 md:block md:last:mb-0">
                  <p
                    aria-hidden="true"
                    className="hidden px-3 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-text-muted/70 uppercase md:block"
                  >
                    {cluster.label}
                  </p>
                  {tabs.map((tab) => {
                    const alarm = tabAlarms[tab.key];
                    const selected = activeMainTabSafe === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={tabId(tab.key)}
                        aria-controls={panelId(tab.key)}
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => setActiveMainTab(tab.key)}
                        onKeyDown={(e) => handleMainTabKeyDown(e, tab.key)}
                        className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors md:w-full md:justify-between ${
                          selected
                            ? "bg-primary/10 text-text"
                            : "text-text-muted hover:bg-card/60 hover:text-text"
                        }`}
                      >
                        {tab.label}
                        {alarm && (
                          <span
                            className={`rounded-sm border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${ALARM_TONE[alarm.tone]}`}
                          >
                            {alarm.count}
                            {/* The number alone is colour-coded shorthand; name what it counts. */}
                            <span className="sr-only"> {alarm.label}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <div
          ref={overviewClipRef}
          className={`relative flex min-h-0 flex-1 flex-col p-4 sm:p-5${clipOverview ? " overflow-hidden" : ""}`}
          style={overviewMaxHeight != null ? { maxHeight: overviewMaxHeight } : undefined}
        >
          <div
            role="tabpanel"
            id={panelId(activeMainTabSafe)}
            aria-labelledby={tabId(activeMainTabSafe)}
            tabIndex={0}
            className={`relative flex min-h-0 flex-1 flex-col${activeMainTabSafe === "overview" ? " pl-0 pr-2" : ""}`}
          >
            {activeMainTabSafe === "overview" ? (
              permissionsLoading ? (
                <TabSpinner label="Loading overview…" />
              ) : (
                <OverviewEditor
                  project={project}
                  editable={canEditOverview}
                  onProjectUpdate={onProjectUpdate}
                  clipOverflow={clipOverview}
                />
              )
            ) : (
              renderMainTabContent()
            )}
            {activeMainTabSafe === "overview" && overviewOverflows && overviewExpanded && (
              <div className="flex justify-center pt-4 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  iconLeft={<ChevronUpIcon className="size-3.5" />}
                  onClick={() => {
                    setOverviewExpanded(false);
                    overviewClipRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }}
                  aria-expanded
                >
                  Show less
                </Button>
              </div>
            )}
          </div>
          {clipOverview && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-card via-card/85 to-transparent pt-16 pb-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-auto"
                iconRight={<ChevronDownIcon className="size-3.5" />}
                onClick={() => setOverviewExpanded(true)}
                aria-expanded={false}
              >
                Show all
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}