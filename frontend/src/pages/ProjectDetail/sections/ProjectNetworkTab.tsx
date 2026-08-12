import { useState, useEffect, useCallback } from "react";
import { networkApi } from "@/services/network";
import type { SecurityRule, RedirectRule } from "@/types";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon, PlusIcon, XIcon } from "lucide-react";

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
  const toast = useToast();

  const handleDelete = async (ruleId: string) => {
    setDeleting(ruleId);
    try {
      await networkApi.deleteSecurityRule(projectId, ruleId);
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete security rule"));
    } finally { setDeleting(null); }
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              iconLeft={<PlusIcon className="size-3.5" />}
            >
              Add security rule
            </Button>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(true)}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add security rule
              </Button>
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
          <Button
            type="button"
            variant="danger" size="sm"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
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
          <Button
            type="button"
            variant="link" size="sm" className="mt-2"
            onClick={() => setShowAddCred(true)}
            iconLeft={<PlusIcon className="size-3.5" />}
          >
            Add credential
          </Button>
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
  const toast = useToast();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await networkApi.deleteCredential(projectId, ruleId, cred.id);
      onDeleted();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete credential"));
    } finally { setDeleting(false); }
  };

  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary-50/50 px-2.5 py-1 text-xs text-text">
      <span className="font-medium">{cred.username}</span>
      {canManage && (
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          disabled={deleting}
          className="px-0! hover:text-danger-500!"
          aria-label={`Remove ${cred.username}`}
        >
          <XIcon className="size-3" />
        </Button>
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowAddCred(false)}
          className="px-0!"
        >
          ← Back to new security rule
        </Button>
        <h3 className="my-4 text-sm font-semibold text-text ">New security credential</h3>
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
          <Input
            type="text"
            
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
          <Input
            type="text"
            
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
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setShowAddCred(true)}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add credential
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {credentials.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary-50/50 px-2.5 py-1 text-xs text-text"
                  >
                    <span className="font-medium">{c.username}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCredentials((prev) => prev.filter((_, idx) => idx !== i))}
                      className="px-0! hover:text-danger-500!"
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </span>
                ))}
              </div>
              <Button
                type="button"
                variant="link" size="sm"
                onClick={() => setShowAddCred(true)}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add credential
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <Button
          type="submit"
          className="w-full"
          disabled={saving || !name.trim()}
        >
          {saving ? "Creating…" : "Add security rule"}
        </Button>
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
        <Input
          type="text"
          
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-muted">Password</label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-0"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </Button>
        </div>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!username.trim() || !password.trim()}
      >
        Add credential
      </Button>
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
          <Input
            type="text"
            
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Password</label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-danger-500">{error}</p>}
        <Button
          type="submit"
          className="w-full"
          disabled={saving || !username.trim() || !password.trim()}
        >
          {saving ? "Adding…" : "Add credential"}
        </Button>
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
  const toast = useToast();

  const handleDelete = async (ruleId: string) => {
    setDeleting(ruleId);
    try {
      await networkApi.deleteRedirectRule(projectId, ruleId);
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete redirect rule"));
    } finally { setDeleting(null); }
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              iconLeft={<PlusIcon className="size-3.5" />}
            >
              Add redirect rule
            </Button>
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
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-sm ${
                  rule.type === "permanent"
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                    : "bg-primary-500/10 text-primary-500 border border-primary-500/30"
                }`}>
                  {rule.type === "permanent" ? "301" : "302"}
                </span>
                {canManage && (
                  <Button
                    type="button"
                    variant="danger" size="sm"
                    onClick={() => handleDelete(rule.id)}
                    disabled={deleting === rule.id}
                  >
                    {deleting === rule.id ? "…" : "Delete"}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="px-4 py-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(true)}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add redirect rule
              </Button>
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
          <Input
            type="text"
            
            placeholder="/from"
            value={fromPath}
            onChange={(e) => setFromPath(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">To</label>
          <Input
            type="text"
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

        <Button
          type="submit"
          className="w-full"
          disabled={saving || !fromPath.trim() || !toPath.trim()}
        >
          {saving ? "Creating…" : "Add redirect rule"}
        </Button>
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
          <Button
            type="button"
            variant="outline"
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
          </Button>
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
