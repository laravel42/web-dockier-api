import { useState, useEffect, useCallback } from "react";
import { networkApi } from "../../../services/network";
import type { SecurityRule, RedirectRule } from "../../../services/network";
import type { Project } from "../../../types";
import { usePermissions } from "../../../context/PermissionsContext";
import Modal from "../../../components/Modal";
import Spinner from "../../../components/Spinner";
import { btnPrimary, btnOutline, inputCls } from "../../../utils/styles";

interface Props {
  project: Project;
}

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

// ─── Security Rules Section ───

function SecurityRulesSection({
  projectId,
  rules,
  canManage,
  onRefresh,
}: {
  projectId: string;
  rules: SecurityRule[];
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (ruleId: string) => {
    setDeleting(ruleId);
    try {
      await networkApi.deleteSecurityRule(projectId, ruleId);
      onRefresh();
    } catch { /* handled by parent */ }
    finally { setDeleting(null); }
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text">Security rules</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Configure HTTP basic access authentication via simple security rules.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-sm font-medium text-text">No security rules yet</p>
          <p className="text-xs text-text-muted">
            Get started and create your first security rule.
          </p>
          {canManage && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setShowCreateModal(true)}
            >
              + Add security rule
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => (
            <SecurityRuleRow
              key={rule.id}
              rule={rule}
              projectId={projectId}
              canManage={canManage}
              deleting={deleting === rule.id}
              onDelete={() => handleDelete(rule.id)}
              onRefresh={onRefresh}
            />
          ))}
          {canManage && (
            <div className="px-4 py-3">
              <button
                type="button"
                className={btnOutline}
                onClick={() => setShowCreateModal(true)}
              >
                + Add security rule
              </button>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateSecurityRuleModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function SecurityRuleRow({
  rule,
  projectId,
  canManage,
  deleting,
  onDelete,
  onRefresh,
}: {
  rule: SecurityRule;
  projectId: string;
  canManage: boolean;
  deleting: boolean;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [showAddCred, setShowAddCred] = useState(false);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-text">{rule.name}</span>
          {rule.path && (
            <span className="ml-2 text-xs text-text-muted font-mono">
              {rule.path}
            </span>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            className="text-xs text-danger-500 hover:text-danger-400 transition-colors disabled:opacity-50"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>

      {/* Credentials list */}
      <div className="mt-2">
        {rule.credentials.length === 0 ? (
          <p className="text-xs text-text-muted italic">No credentials</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rule.credentials.map((cred) => (
              <CredentialChip
                key={cred.id}
                cred={cred}
                projectId={projectId}
                ruleId={rule.id}
                canManage={canManage}
                onDeleted={onRefresh}
              />
            ))}
          </div>
        )}
        {canManage && (
          <button
            type="button"
            className="mt-2 text-xs text-primary-500 hover:text-primary-400 transition-colors"
            onClick={() => setShowAddCred(true)}
          >
            + Add credential
          </button>
        )}
      </div>

      {showAddCred && (
        <AddCredentialModal
          projectId={projectId}
          ruleId={rule.id}
          onClose={() => setShowAddCred(false)}
          onAdded={() => { setShowAddCred(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function CredentialChip({
  cred,
  projectId,
  ruleId,
  canManage,
  onDeleted,
}: {
  cred: { id: string; username: string };
  projectId: string;
  ruleId: string;
  canManage: boolean;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await networkApi.deleteCredential(projectId, ruleId, cred.id);
      onDeleted();
    } catch { /* silent */ }
    finally { setDeleting(false); }
  };

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary-50/50 px-2.5 py-1 text-xs text-text">
      <span className="font-medium">{cred.username}</span>
      {canManage && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-text-muted hover:text-danger-500 transition-colors disabled:opacity-50"
          aria-label={`Remove ${cred.username}`}
        >
          <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

// ─── Create Security Rule Modal ───

function CreateSecurityRuleModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [credentials, setCredentials] = useState<Array<{ username: string; password: string }>>([]);
  const [showAddCred, setShowAddCred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await networkApi.createSecurityRule(projectId, {
        name: name.trim(),
        path: path.trim() || undefined,
        credentials: credentials.length > 0 ? credentials : undefined,
      });
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  if (showAddCred) {
    return (
      <Modal open onClose={onClose} title="New security rule">
        <button
          type="button"
          onClick={() => setShowAddCred(false)}
          className="text-xs text-text-muted hover:text-text transition-colors mb-3 flex items-center gap-1"
        >
          ← Back to new security rule
        </button>
        <h3 className="text-sm font-semibold text-text mb-4">New security credential</h3>
        <InlineCredentialForm
          onAdd={(cred) => {
            setCredentials((prev) => [...prev, cred]);
            setShowAddCred(false);
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="New security rule">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
          <input
            type="text"
            className={inputCls}
            placeholder="Restricted Access"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Path <span className="text-text-muted/60 ml-1 font-normal">Optional</span>
          </label>
          <p className="text-[11px] text-text-muted mb-1.5">
            Leave blank to password protect all routes within your site. Any valid Nginx location path is acceptable.
          </p>
          <input
            type="text"
            className={inputCls}
            placeholder="/admin"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </div>

        {/* Credentials preview */}
        <div className="rounded-lg border border-border p-4">
          {credentials.length === 0 ? (
            <div className="text-center">
              <p className="text-sm font-medium text-text">No credentials</p>
              <p className="text-xs text-text-muted mt-0.5">
                Get started and add a first credential for this rule.
              </p>
              <button
                type="button"
                className={`${btnOutline} mt-3`}
                onClick={() => setShowAddCred(true)}
              >
                + Add credential
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {credentials.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary-50/50 px-2.5 py-1 text-xs text-text"
                  >
                    <span className="font-medium">{c.username}</span>
                    <button
                      type="button"
                      onClick={() => setCredentials((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-text-muted hover:text-danger-500 transition-colors"
                    >
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="text-xs text-primary-500 hover:text-primary-400 transition-colors"
                onClick={() => setShowAddCred(true)}
              >
                + Add credential
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <button
          type="submit"
          className={`${btnPrimary} w-full`}
          disabled={saving || !name.trim()}
        >
          {saving ? "Creating…" : "Add security rule"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Inline Credential Form ───

function InlineCredentialForm({
  onAdd,
}: {
  onAdd: (cred: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    onAdd({ username: username.trim(), password: password.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-text-muted">Username</label>
        <input
          type="text"
          className={inputCls}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-muted">Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {showPassword ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>
      <button
        type="submit"
        className={`${btnPrimary} w-full`}
        disabled={!username.trim() || !password.trim()}
      >
        Add credential
      </button>
    </form>
  );
}

// ─── Add Credential Modal (for existing rules) ───

function AddCredentialModal({
  projectId,
  ruleId,
  onClose,
  onAdded,
}: {
  projectId: string;
  ruleId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setSaving(true);
    setError("");
    try {
      await networkApi.addCredential(projectId, ruleId, {
        username: username.trim(),
        password: password.trim(),
      });
      onAdded();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to add credential");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New security credential">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Username</label>
          <input
            type="text"
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {showPassword ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-danger-500">{error}</p>}
        <button
          type="submit"
          className={`${btnPrimary} w-full`}
          disabled={saving || !username.trim() || !password.trim()}
        >
          {saving ? "Adding…" : "Add credential"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Redirect Rules Section ───

function RedirectRulesSection({
  projectId,
  rules,
  canManage,
  onRefresh,
}: {
  projectId: string;
  rules: RedirectRule[];
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (ruleId: string) => {
    setDeleting(ruleId);
    try {
      await networkApi.deleteRedirectRule(projectId, ruleId);
      onRefresh();
    } catch { /* handled by parent */ }
    finally { setDeleting(null); }
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text">Redirect rules</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Configure simple redirect rules for your site. Redirects are handled by Nginx and not by your application.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-sm font-medium text-text">No redirect rules yet</p>
          <p className="text-xs text-text-muted">
            Get started and create your first redirect rule.
          </p>
          {canManage && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setShowCreateModal(true)}
            >
              + Add redirect rule
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted border-b border-border">
            <span>From</span>
            <span>To</span>
            <span>Type</span>
            <span></span>
          </div>
          <div className="divide-y divide-border">
            {rules.map((rule) => (
              <div key={rule.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-4 py-2.5 items-center">
                <span className="text-xs font-mono text-text truncate">{rule.fromPath}</span>
                <span className="text-xs font-mono text-text truncate">{rule.toPath}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  rule.type === "permanent"
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                    : "bg-primary-500/10 text-primary-500 border border-primary-500/30"
                }`}>
                  {rule.type === "permanent" ? "301" : "302"}
                </span>
                {canManage && (
                  <button
                    type="button"
                    className="text-xs text-danger-500 hover:text-danger-400 transition-colors disabled:opacity-50"
                    onClick={() => handleDelete(rule.id)}
                    disabled={deleting === rule.id}
                  >
                    {deleting === rule.id ? "…" : "Delete"}
                  </button>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="px-4 py-3 border-t border-border">
              <button
                type="button"
                className={btnOutline}
                onClick={() => setShowCreateModal(true)}
              >
                + Add redirect rule
              </button>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateRedirectRuleModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Create Redirect Rule Modal ───

function CreateRedirectRuleModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [type, setType] = useState<"temporary" | "permanent">("temporary");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromPath.trim() || !toPath.trim()) return;
    setSaving(true);
    setError("");
    try {
      await networkApi.createRedirectRule(projectId, {
        fromPath: fromPath.trim(),
        toPath: toPath.trim(),
        type,
      });
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create redirect rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New redirect rule">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">From</label>
          <input
            type="text"
            className={inputCls}
            placeholder="/from"
            value={fromPath}
            onChange={(e) => setFromPath(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">To</label>
          <input
            type="text"
            className={inputCls}
            placeholder="/to"
            value={toPath}
            onChange={(e) => setToPath(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-text-muted">Type</label>
          <div className="rounded-lg border border-border divide-y divide-border">
            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary-50/50 transition-colors">
              <input
                type="radio"
                name="redirect-type"
                value="temporary"
                checked={type === "temporary"}
                onChange={() => setType("temporary")}
                className="accent-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-text">Temporary</span>
                <span className="ml-2 text-xs text-text-muted">Temporary redirect (302)</span>
              </div>
            </label>
            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary-50/50 transition-colors">
              <input
                type="radio"
                name="redirect-type"
                value="permanent"
                checked={type === "permanent"}
                onChange={() => setType("permanent")}
                className="accent-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-text">Permanent</span>
                <span className="ml-2 text-xs text-text-muted">Permanent redirect (301)</span>
              </div>
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <button
          type="submit"
          className={`${btnPrimary} w-full`}
          disabled={saving || !fromPath.trim() || !toPath.trim()}
        >
          {saving ? "Creating…" : "Add redirect rule"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Main Network Tab ───

export default function ProjectNetworkTab({ project }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const canView = has("project:view");

  const [securityRules, setSecurityRules] = useState<SecurityRule[]>([]);
  const [redirectRules, setRedirectRules] = useState<RedirectRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sync status
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!project.id || !canView) return;
    setLoading(true);
    setError("");
    try {
      const [secRes, redRes] = await Promise.all([
        networkApi.listSecurityRules(project.id),
        networkApi.listRedirectRules(project.id),
      ]);
      setSecurityRules(secRes.rules);
      setRedirectRules(redRes.rules);
    } catch {
      setError("Failed to load network rules");
    } finally {
      setLoading(false);
    }
  }, [project.id, canView]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await networkApi.apply(project.id);
      setSyncStatus({ success: res.success, message: res.message });
    } catch (err: unknown) {
      setSyncStatus({ success: false, message: (err as Error).message || "Sync failed" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canView) { setLoading(false); return; }
    void fetchData();
  }, [permissionsLoading, canView, fetchData]);

  if (permissionsLoading || loading) {
    return <TabSpinner label="Loading network rules…" />;
  }

  if (!canView) {
    return <p className="text-sm text-text-muted text-center py-8">You don't have permission to view network settings.</p>;
  }

  if (error) {
    return <p className="text-sm text-danger-500 text-center py-8">{error}</p>;
  }

  const hasRules = securityRules.length > 0 || redirectRules.length > 0;

  return (
    <div className="space-y-6 overflow-y-auto pr-1">
      {/* Sync status bar */}
      {hasRules && canManage && (
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            {syncStatus && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                syncStatus.success ? "text-success-500" : "text-danger-500"
              }`}>
                <span className={`size-2 rounded-full ${syncStatus.success ? "bg-success-500" : "bg-danger-500"}`} />
                {syncStatus.message}
              </span>
            )}
            {!syncStatus && (
              <span className="text-xs text-text-muted">
                Rules are auto-applied when saved. Use Sync to verify or force re-apply.
              </span>
            )}
          </div>
          <button
            type="button"
            className={btnOutline}
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" /> Syncing…
              </span>
            ) : (
              "Sync now"
            )}
          </button>
        </div>
      )}

      <SecurityRulesSection
        projectId={project.id}
        rules={securityRules}
        canManage={canManage}
        onRefresh={fetchData}
      />
      <RedirectRulesSection
        projectId={project.id}
        rules={redirectRules}
        canManage={canManage}
        onRefresh={fetchData}
      />
    </div>
  );
}
