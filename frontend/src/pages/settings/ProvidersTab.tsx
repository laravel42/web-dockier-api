import { useState } from "react";
import { deployApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import ProviderBadge from "../../components/ProviderBadge";
import { getProviderStyle } from "../../data/providers";
import { SearchableCombobox } from "../../components/ui/combobox";
import { inputCls, btnPrimary, btnDanger, cardInteractiveCls } from "../../utils/styles";
import { usePermissions } from "../../context/PermissionsContext";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import { useTabList } from "../../hooks/useTabList";

export default function ProvidersTab() {
  const { has } = usePermissions();
  const canManage = has("credential:manage");
  const { data: providers, loading, error, reload } = useTabList(
    () => deployApi.listProviders().then((res) => res.providers),
    [],
  );
  const providerList = providers ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<{ id: string; provider: string; label: string; apiKey?: string; apiSecret?: string; enabled?: boolean; createdAt?: string } | null>(null);
  const [editForm, setEditForm] = useState({ label: "", apiKey: "", apiSecret: "" });
  const [editEnabled, setEditEnabled] = useState(true);
  const [form, setForm] = useState({ provider: "aws", label: "", apiKey: "", apiSecret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = reload;

  const apiKeyOnlyProviders: string[] = [];
  const needsSecret = !apiKeyOnlyProviders.includes(form.provider);

  const credLabel1 = "API Key";
  const credLabel2 = "API Secret";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await deployApi.addProvider({
      provider: form.provider, label: form.label, apiKey: form.apiKey,
      apiSecret: needsSecret ? form.apiSecret : "",
    });
    setShowForm(false); setForm({ provider: "aws", label: "", apiKey: "", apiSecret: "" }); fetch_();
  };

  const openEdit = (p: (typeof providerList)[number]) => {
    setEditingProvider({
      id: p.id,
      provider: p.provider,
      label: p.label,
      enabled: true,
      createdAt: p.createdAt,
    });
    setEditForm({ label: p.label, apiKey: "", apiSecret: "" });
    setEditEnabled(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    await deployApi.updateProvider(editingProvider.id, { label: editForm.label });
    setEditingProvider(null); fetch_();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Server Providers</h2>
        {canManage && (
          <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Provider
          </button>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Provider">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="provider-type" className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
            <SearchableCombobox
              id="provider-type"
              value={form.provider}
              onValueChange={(provider) => setForm({ ...form, provider })}
              options={[
                { value: "aws", label: "AWS" },
                { value: "gcp", label: "Google Cloud" },
              ]}
              placeholder="Select provider"
            />
          </div>
          <div>
            <label htmlFor="provider-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
            <input id="provider-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="provider-key" className="block text-sm font-medium text-text-secondary mb-1.5">{credLabel1}</label>
            <input id="provider-key" type="text" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className={inputCls} required />
          </div>

          {(needsSecret) && <div>
            <label htmlFor="provider-secret" className="block text-sm font-medium text-text-secondary mb-1.5">{credLabel2}</label>
            <div className="relative">
              <input id="provider-secret" type={showSecret ? "text" : "password"} value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                className={`${inputCls} pr-10`} required />
              <button type="button" onClick={() => setShowSecret(!showSecret)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary transition-colors"
                aria-label={showSecret ? "Hide API secret" : "Show API secret"}>
                {showSecret ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4.5 ">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4.5 ">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>}
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Add Provider</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingProvider} onClose={() => setEditingProvider(null)} title={editingProvider ? getProviderStyle(editingProvider.provider).name || editingProvider.provider : "Provider"} size="lg">
        {editingProvider && (
            <form onSubmit={handleEditSave} className="space-y-5">
              {/* Hero header */}
              <div className="flex items-center gap-5">
                <div className="size-14  rounded-xl flex items-center justify-center shrink-0">
                  <ProviderBadge provider={editingProvider.provider} showName={false} iconSize="w-10 h-10" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-text">{getProviderStyle(editingProvider.provider).name || editingProvider.provider}</p>
                  <p className="text-sm text-text-muted">{getProviderStyle(editingProvider.provider).description}</p>
                </div>
              </div>

              {/* Metadata bar */}
              <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Added</span>
                  <p className="text-text font-medium mt-0.5">{editingProvider.createdAt ? new Date(editingProvider.createdAt).toLocaleDateString() : "—"}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Status</span>
                  <p className={`font-medium mt-0.5 ${editEnabled ? "text-success-500" : "text-text-muted"}`}>{editEnabled ? "Connected" : "Disabled"}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Provider</span>
                  <p className="text-text font-medium mt-0.5 capitalize">{editingProvider.provider}</p>
                </div>
                <div className="ml-auto">
                  <button id="edit-provider-enabled" type="button" onClick={() => setEditEnabled(!editEnabled)}
                    className={`px-4 py-1.5 rounded-(--radius-btn) text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-white hover:bg-primary-600"}`}>
                    {editEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>

              {/* Overview */}
              <div>
                <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
                <p className="text-sm/relaxed text-text-secondary ">{getProviderStyle(editingProvider.provider).description}</p>
              </div>

              {/* Configuration */}
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                <div>
                  <label htmlFor="edit-provider-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
                  <input id="edit-provider-label" type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} className={inputCls} required />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button type="button" onClick={() => setConfirmRemove(true)} className={btnDanger}>Remove</button>
                <button type="submit" className={btnPrimary}>Save Changes</button>
              </div>
            </form>
        )}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingProvider) deployApi.deleteProvider(editingProvider.id).then(fetch_); setEditingProvider(null); setConfirmRemove(false); }} message="Are you sure you want to remove this provider?" />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {providerList.map((p) => (
            <div key={p.id} onClick={() => openEdit(p)} className={`${cardInteractiveCls} p-4`}>
              <div className="flex items-center gap-3 mb-2">
                <div className="size-8  flex items-center justify-center shrink-0">
                  <ProviderBadge provider={p.provider} showName={false} iconSize="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{getProviderStyle(p.provider).name || p.provider}</p>
                  <p className="text-xs text-text-muted truncate">{p.label}</p>
                </div>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-success-50 text-success-500`}>Connected</span>
              <p className="text-xs text-text-muted mt-2">{getProviderStyle(p.provider).description}</p>
            </div>
          ))}
          {providerList.length === 0 && (
            <div className="col-span-full">
              <EmptyMessage>No server providers configured</EmptyMessage>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
