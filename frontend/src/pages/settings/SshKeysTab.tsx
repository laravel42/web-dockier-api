import { useState } from "react";
import { deployApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import SettingsModalFooter from "../../components/SettingsModalFooter";
import { inputCls, btnPrimary, readonlyFieldCls, typePanelDesc, typePanelTitle, settingsCardGridCls, settingsCardInteractiveCls, typeCardDateCls } from "../../utils/styles";
import { formatCardDateTime } from "../../utils/formatCardDate";
import { getErrorMessage } from "../../utils/errors";
import { usePermissions } from "../../context/PermissionsContext";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import Alert from "../../components/ui/Alert";
import { useTabList } from "../../hooks/useTabList";

export default function SshKeysTab() {
  const { has } = usePermissions();
  const canManage = has("credential:manage");
  const { data: keys, loading, error: loadError, reload } = useTabList(
    () => deployApi.listSshKeys().then((res) => res.keys),
    [],
  );
  const keyList = keys ?? [];
  const [showForm, setShowForm] = useState(false);
  const [viewingKey, setViewingKey] = useState<(typeof keyList)[number] | null>(null);
  const [form, setForm] = useState({ label: "", publicKey: "" });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalizeSshPublicKey = (key: string) => {
    const parts = key.trim().split(/\s+/);
    if (parts.length < 2) return key.trim();
    return `${parts[0]} ${parts[1]}`;
  };

  const isDuplicateKey = (publicKey: string) => {
    const normalized = normalizeSshPublicKey(publicKey);
    return keyList.some((k) => normalizeSshPublicKey(k.publicKey) === normalized);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (isDuplicateKey(form.publicKey)) {
      setFormError("This SSH public key is already registered");
      return;
    }
    setSubmitting(true);
    try {
      await deployApi.addSshKey({ label: form.label, publicKey: form.publicKey.trim() });
      setShowForm(false);
      setForm({ label: "", publicKey: "" });
      reload();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "Failed to add SSH key"));
    } finally {
      setSubmitting(false);
    }
  };

  const keyType = (key: string) => key.trim().split(/\s+/)[0] || "ssh";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={typePanelTitle}>SSH Keys</h2>
          <p className={`${typePanelDesc} mt-0.5`}>SSH keys used for VPS deployments (AWS EC2, GCP Compute Engine)</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add SSH Key
          </button>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setFormError(""); setSubmitting(false); }} title="Add SSH Key">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="ssh-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
            <input id="ssh-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputCls} placeholder="e.g. MacBook Pro" required />
          </div>
          <div>
            <label htmlFor="ssh-pubkey" className="block text-sm font-medium text-text-secondary mb-1.5">Public Key</label>
            <textarea id="ssh-pubkey" value={form.publicKey} onChange={(e) => setForm({ ...form, publicKey: e.target.value })}
              className={`${inputCls} h-28 py-2.5 font-mono text-xs resize-none`}
              placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@host" required />
            <p className="text-xs text-text-muted mt-1">Paste the contents of your public key file (e.g. ~/.ssh/id_ed25519.pub)</p>
          </div>
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className={`${btnPrimary} disabled:opacity-50`}>
              {submitting ? "Adding…" : "Add Key"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!viewingKey} onClose={() => setViewingKey(null)} title={viewingKey?.label || "SSH Key"}>
        {viewingKey && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Algorithm</label>
              <p className="text-sm text-text">{keyType(viewingKey.publicKey)}</p>
            </div>
            <div>
              <label htmlFor="ssh-view-pubkey" className="block text-sm font-medium text-text-secondary mb-1.5">Public Key</label>
              <textarea
                id="ssh-view-pubkey"
                readOnly
                aria-readonly="true"
                value={viewingKey.publicKey}
                className={`${inputCls} ${readonlyFieldCls} h-28 py-2.5 font-mono text-xs resize-none`}
              />
            </div>
            {canManage && (
              <SettingsModalFooter
                onDelete={() => setConfirmRemove(true)}
                deleteAriaLabel={`Remove ${viewingKey.label}`}
              >
                <button type="button" onClick={() => setViewingKey(null)} className="h-9 px-4 text-sm font-medium rounded-lg border border-border text-text-muted hover:bg-secondary-50 transition-colors">
                  Close
                </button>
              </SettingsModalFooter>
            )}
          </div>
        )}
      </Modal>

      {loading ? (
        <PageLoading />
      ) : loadError ? (
        <PageError message={loadError} onRetry={reload} />
      ) : (
        <div className={settingsCardGridCls}>
          {keyList.map((k) => (
            <div
              key={k.id}
              onClick={() => setViewingKey(k)}
              className={settingsCardInteractiveCls}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="size-9 rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{k.label}</p>
                  <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600">
                    {keyType(k.publicKey)}
                  </span>
                </div>
              </div>
              <span className={`${typeCardDateCls} text-xs text-text-muted text-right`}>           
                Added {formatCardDateTime(k.createdAt)}
              </span>
            </div>
          ))}
          {keyList.length === 0 && (
            <div className="col-span-full">
              <EmptyMessage>No SSH keys added yet</EmptyMessage>
            </div>
          )}
        </div>
      )}
      <ConfirmModal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          if (viewingKey) deployApi.deleteSshKey(viewingKey.id).then(reload);
          setViewingKey(null);
          setConfirmRemove(false);
        }}
        message="Are you sure you want to remove this SSH key?"
      />
    </div>
  );
}
