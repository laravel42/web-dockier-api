import { useState } from "react";
import { deployApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import { inputCls, btnPrimary, btnDanger } from "../../utils/styles";
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
  const [form, setForm] = useState({ label: "", publicKey: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      await deployApi.addSshKey({ label: form.label, publicKey: form.publicKey });
      setShowForm(false);
      setForm({ label: "", publicKey: "" });
      reload();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "Failed to add SSH key"));
    }
  };

  const truncateKey = (key: string) => {
    const parts = key.split(/\s+/);
    if (parts.length >= 2) {
      const type = parts[0];
      const b64 = parts[1];
      const comment = parts[2] || "";
      return `${type} ${b64.slice(0, 20)}...${b64.slice(-8)}${comment ? ` ${comment}` : ""}`;
    }
    return key.length > 60 ? key.slice(0, 60) + "..." : key;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">SSH Keys</h2>
          <p className="text-sm text-text-muted mt-0.5">SSH keys used for VPS deployments (AWS EC2, GCP Compute Engine)</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add SSH Key
          </button>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setFormError(""); }} title="Add SSH Key">
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
            <button type="submit" className={btnPrimary}>Add Key</button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <PageLoading />
      ) : loadError ? (
        <PageError message={loadError} onRetry={reload} />
      ) : (
        <div className="space-y-3">
          {keyList.map((k) => (
            <div key={k.id} className="bg-card rounded-card shadow-(--shadow-card) p-5 flex items-center justify-between hover:shadow-(--shadow-card-hover) transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-bold text-text">{k.label}</p>
                  <p className="text-xs text-text-muted font-mono mt-0.5">{truncateKey(k.publicKey)}</p>
                  <p className="text-xs text-text-muted mt-0.5">Added {new Date(k.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <button onClick={() => setDeleteId(k.id)} className={btnDanger}>Remove</button>
            </div>
          ))}
          {keyList.length === 0 && <EmptyMessage>No SSH keys added yet</EmptyMessage>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) deployApi.deleteSshKey(deleteId).then(reload); setDeleteId(null); }} message="Are you sure you want to remove this SSH key?" />
    </div>
  );
}
