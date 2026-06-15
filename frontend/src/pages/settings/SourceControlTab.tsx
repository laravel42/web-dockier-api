import { useState } from "react";
import { gitApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import SettingsModalFooter from "../../components/SettingsModalFooter";
import SourceControlBadge, { getSourceControl } from "../../components/SourceControlBadge";
import { SearchableCombobox } from "../../components/ui/combobox";
import { inputCls, btnPrimary, settingsCardGridCls, settingsCardInteractiveCls, settingsCardCls } from "../../utils/styles";
import { getErrorMessage } from "../../utils/errors";
import { usePermissions } from "../../context/PermissionsContext";
import { useToast } from "../../context/useToast";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import { useTabList } from "../../hooks/useTabList";

export default function SourceControlTab() {
  const { has } = usePermissions();
  const canManage = has("credential:manage");
  const toast = useToast();
  const { data: connections, loading, error, reload } = useTabList(
    () => gitApi.listConnections().then((res) => res.connections),
    [],
  );
  const connectionList = connections ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<{ id: string; provider: string; label: string; endpoint?: string; createdAt?: string } | null>(null);
  const [editForm, setEditForm] = useState({ label: "", personalToken: "", endpoint: "" });
  const [form, setForm] = useState({ provider: "github", personalToken: "", label: "", endpoint: "" });
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = reload;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await gitApi.addConnection({ ...form, repoUrl: "" });
      setShowForm(false); setForm({ provider: "github", personalToken: "", label: "", endpoint: "" }); fetch_();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to add connection"));
    }
  };

  const openEdit = (conn: (typeof connectionList)[number]) => {
    setEditingConn(conn);
    setEditForm({ label: conn.label, personalToken: "", endpoint: conn.endpoint || "" });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConn) return;
    await gitApi.updateConnection(editingConn.id, {
      label: editForm.label,
      ...(editForm.personalToken ? { personalToken: editForm.personalToken } : {}),
    });
    setEditingConn(null); fetch_();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Source Control Connections</h2>
          <p className="text-sm text-text-muted mt-0.5">Connect Git providers for projects and deployments.</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Connection
          </button>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Connection">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="git-provider" className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
            <SearchableCombobox
              id="git-provider"
              value={form.provider}
              onValueChange={(provider) => setForm({ ...form, provider })}
              options={[
                { value: "github", label: "GitHub" },
                { value: "gitlab", label: "GitLab" },
                { value: "gitlab_self_hosted", label: "GitLab Self-Hosted" },
                { value: "bitbucket", label: "Bitbucket" },
              ]}
              placeholder="Select provider"
            />
          </div>
          <div>
            <label htmlFor="git-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
            <input id="git-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputCls} placeholder="My GitHub Account" required />
          </div>
          <div>
            <label htmlFor="git-token" className="block text-sm font-medium text-text-secondary mb-1.5">Personal Access Token</label>
            <input id="git-token" type="password" value={form.personalToken} onChange={(e) => setForm({ ...form, personalToken: e.target.value })} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="git-endpoint" className="block text-sm font-medium text-text-secondary mb-1.5">
              API Endpoint <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              id="git-endpoint"
              type="url"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              className={inputCls}
              placeholder={form.provider === "github" ? "https://api.github.com" : form.provider === "bitbucket" ? "https://api.bitbucket.org" : "https://gitlab.com"}
            />
            <p className="text-xs text-text-muted mt-1">Leave empty for default. Set for self-hosted instances.</p>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Connect</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingConn} onClose={() => setEditingConn(null)} title={editingConn ? editingConn.provider.replace("_", " ") : "Connection"} size="lg">
        {editingConn && (
          <form onSubmit={handleEditSave} className="space-y-5">
            {/* Hero header */}
            <div className="flex items-center gap-5">
              <div className="size-14  rounded-xl flex items-center justify-center shrink-0">
                <SourceControlBadge provider={editingConn.provider} showName={false} iconSize="w-10 h-10" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-text capitalize">{editingConn.provider.replace("_", " ")}</p>
                <p className="text-sm text-text-muted">{getSourceControl(editingConn.provider).description}</p>
              </div>
            </div>

            {/* Metadata bar */}
            <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Connected</span>
                <p className="text-text font-medium mt-0.5">{editingConn.createdAt ? new Date(editingConn.createdAt).toLocaleDateString() : "—"}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Status</span>
                <p className="font-medium mt-0.5 text-success-500">Connected</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Provider</span>
                <p className="text-text font-medium mt-0.5 capitalize">{editingConn.provider.replace("_", " ")}</p>
              </div>
            </div>

            {/* Overview */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
              <p className="text-sm/relaxed text-text-secondary ">{getSourceControl(editingConn.provider).description}</p>
            </div>

            {/* Configuration */}
            <div className="border-t border-border pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-text">Configuration</h3>
              <div>
                <label htmlFor="edit-conn-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
                <input id="edit-conn-label" type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label htmlFor="edit-conn-token" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Personal Access Token <span className="text-text-muted font-normal">(leave empty to keep current)</span>
                </label>
                <input id="edit-conn-token" type="password" value={editForm.personalToken} onChange={(e) => setEditForm({ ...editForm, personalToken: e.target.value })} className={inputCls} placeholder="••••••••" autoComplete="off" />
                <p className="text-xs text-text-muted mt-1">Enter a new token to replace the existing one. Leave blank to keep the current token.</p>
              </div>
              <div>
                <label htmlFor="edit-conn-endpoint" className="block text-sm font-medium text-text-secondary mb-1.5">
                  API Endpoint <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input id="edit-conn-endpoint" type="url" value={editForm.endpoint} onChange={(e) => setEditForm({ ...editForm, endpoint: e.target.value })} className={inputCls} placeholder="Leave empty for default" />
              </div>
            </div>

            {/* Footer */}
            <SettingsModalFooter
              onDelete={canManage ? () => setConfirmRemove(true) : undefined}
              deleteAriaLabel={`Remove ${editForm.label || "connection"}`}
            >
              <button type="submit" className={btnPrimary}>Save Changes</button>
            </SettingsModalFooter>
          </form>
        )}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingConn) gitApi.deleteConnection(editingConn.id).then(fetch_); setEditingConn(null); setConfirmRemove(false); }} message="Are you sure you want to remove this connection?" />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : (
        <div className={settingsCardGridCls}>
          {connectionList.map((conn) => (
            <div key={conn.id} onClick={() => canManage && openEdit(conn)} className={canManage ? settingsCardInteractiveCls : settingsCardCls}>
              <div className="flex items-center gap-3 mb-2">
                <div className="size-8  flex items-center justify-center shrink-0">
                  <SourceControlBadge provider={conn.provider} showName={false} iconSize="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text capitalize truncate">{conn.provider.replace("_", " ")}</p>
                  <p className="text-xs text-text-muted truncate">{conn.label}</p>
                </div>
              </div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-success-50 text-success-500">Connected</span>
              <span className={`block text-xs text-text-muted text-left px-2 py-0.5 `}>{getSourceControl(conn.provider).description}</span>
            </div>
          ))}
          {connectionList.length === 0 && (
            <div className="col-span-full">
              <EmptyMessage>No source control connections yet. Add one to get started.</EmptyMessage>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
