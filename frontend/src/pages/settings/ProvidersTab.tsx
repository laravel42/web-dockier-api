import { useState } from "react";
import { deployApi } from "../../services/api";
import Modal from "../../components/Modal";
import SettingsModalFooter from "../../components/SettingsModalFooter";
import ConfirmModal from "../../components/ConfirmModal";
import ProviderBadge from "../../components/ProviderBadge";
import { getProviderStyle } from "../../data/providers";
import { SearchableCombobox } from "../../components/ui/combobox";
import { inputCls, settingsBadgeCls, settingsCardCls, settingsCardGridCls, settingsCardInteractiveCls } from "../../utils/styles";
import Button from "../../components/ui/Button";
import { usePermissions } from "../../context/PermissionsContext";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import { useTabList } from "../../hooks/useTabList";
import PlusIcon from "@/components/icons/outlined/PlusIcon";
import EyeIcon from "../../components/icons/outlined/EyeIcon";
import EyeSlashIcon from "../../components/icons/outlined/EyeSlashIcon";

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
        <div>
          <h2 className="text-base font-semibold text-text">Server Providers</h2>
          <p className="text-sm text-text-muted mt-0.5">Connect cloud providers used for deployments.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)} iconLeft={<PlusIcon />}>
            Add Provider
          </Button>
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
                  <EyeSlashIcon className="size-4.5" />
                ) : (
                  <EyeIcon className="size-4.5" />
                )}
              </button>
            </div>
          </div>}
          <div className="flex justify-end">
            <Button type="submit">Add Provider</Button>
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
              <SettingsModalFooter
                onDelete={canManage ? () => setConfirmRemove(true) : undefined}
                deleteAriaLabel={`Remove ${editForm.label || "provider"}`}
              >
                <Button type="submit">Save Changes</Button>
              </SettingsModalFooter>
            </form>
        )}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingProvider) deployApi.deleteProvider(editingProvider.id).then(fetch_); setEditingProvider(null); setConfirmRemove(false); }} message="Are you sure you want to remove this provider?" />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : (
        <div className={settingsCardGridCls}>
          {providerList.map((p) => (
            <div key={p.id} onClick={() => canManage && openEdit(p)} className={canManage ? settingsCardInteractiveCls : settingsCardCls}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="size-8  flex items-center justify-center shrink-0">
                    <ProviderBadge provider={p.provider} showName={false} iconSize="w-7 h-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{getProviderStyle(p.provider).name || p.provider}</p>
                    <p className="text-xs text-text-muted truncate">{p.label}</p>
                  </div>
                </div>
                <span className={`shrink-0 ${settingsBadgeCls.success}`}>Connected</span>
              </div>
              <span className={`block text-xs text-text-muted text-left px-2 py-0.5`}>{getProviderStyle(p.provider).description}</span>
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
