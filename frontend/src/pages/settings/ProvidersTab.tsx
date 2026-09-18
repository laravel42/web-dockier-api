import { useState } from "react";
import { deployApi } from "@/services/api";
import type { AddProviderPayload, UpdateProviderPayload } from "@/services/deploy";
import Modal from "@/components/Modal";
import SettingsModalFooter from "@/components/SettingsModalFooter";
import ConfirmModal from "@/components/ConfirmModal";
import ProviderBadge from "@/components/ProviderBadge";
import { getProviderStyle } from "@/data/providers";
import { SearchableCombobox } from "@/components/ui/combobox";
import { settingsBadgeCls, settingsCardCls, settingsCardGridCls, settingsCardInteractiveCls } from "@/utils/styles";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Button from "@/components/ui/Button";
import { usePermissions } from "@/context/PermissionsContext";
import PageLoading from "@/components/ui/PageLoading";
import PageError, { EmptyMessage } from "@/components/ui/PageError";
import { useAsyncData } from "@/hooks/useAsyncData";
import { EyeIcon, EyeOffIcon, PlusIcon } from "lucide-react";
import { clickableProps } from "@/utils/a11y";
import MetadataBar from "./components/MetadataBar";
import SettingsHeroHeader from "./components/SettingsHeroHeader";

/** Provider types the app supports. Only AWS and GCP for now. */
type ProviderKind = "aws" | "gcp";

/**
 * Form state holds every possible credential field; only the fields relevant to
 * the selected provider are rendered and submitted. AWS uses an access key id +
 * secret access key; GCP uses a single service-account JSON key.
 */
interface CredentialForm {
  label: string;
  accessKeyId: string;
  secretAccessKey: string;
  serviceAccountKey: string;
}

const EMPTY_FORM: CredentialForm = { label: "", accessKeyId: "", secretAccessKey: "", serviceAccountKey: "" };

export default function ProvidersTab() {
  const { has } = usePermissions();
  const canManage = has("credential:manage");
  const { data: providers, loading, error, reload } = useAsyncData(
    () => deployApi.listProviders().then((res) => res.providers),
    [],
  );
  const providerList = providers ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<{ id: string; provider: string; label: string; createdAt?: string } | null>(null);
  const [editForm, setEditForm] = useState<CredentialForm>(EMPTY_FORM);
  const [editEnabled, setEditEnabled] = useState(true);
  const [addProviderKind, setAddProviderKind] = useState<ProviderKind>("aws");
  const [form, setForm] = useState<CredentialForm>(EMPTY_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = reload;

  const resetAddForm = () => {
    setForm(EMPTY_FORM);
    setAddProviderKind("aws");
    setShowSecret(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AddProviderPayload =
      addProviderKind === "aws"
        ? { provider: "aws", label: form.label, accessKeyId: form.accessKeyId.trim(), secretAccessKey: form.secretAccessKey.trim() }
        : { provider: "gcp", label: form.label, serviceAccountKey: form.serviceAccountKey.trim() };
    await deployApi.addProvider(payload);
    setShowForm(false);
    resetAddForm();
    fetch_();
  };

  const openEdit = (p: (typeof providerList)[number]) => {
    setEditingProvider({ id: p.id, provider: p.provider, label: p.label, createdAt: p.createdAt });
    setEditForm({ ...EMPTY_FORM, label: p.label });
    setEditEnabled(true);
    setShowSecret(false);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    const kind = normalizeProviderKind(editingProvider.provider);
    // Only send credential fields the user actually entered — blank inputs mean
    // "keep the existing value". The backend merges partial updates, so a user
    // can rotate a single field (e.g. just the AWS secret) or the whole key.
    let payload: UpdateProviderPayload;
    if (kind === "aws") {
      payload = { provider: "aws", label: editForm.label };
      if (editForm.accessKeyId.trim()) payload.accessKeyId = editForm.accessKeyId.trim();
      if (editForm.secretAccessKey.trim()) payload.secretAccessKey = editForm.secretAccessKey.trim();
    } else {
      payload = { provider: "gcp", label: editForm.label };
      if (editForm.serviceAccountKey.trim()) payload.serviceAccountKey = editForm.serviceAccountKey.trim();
    }
    await deployApi.updateProvider(editingProvider.id, payload);
    setEditingProvider(null);
    fetch_();
  };

  const editKind = editingProvider ? normalizeProviderKind(editingProvider.provider) : "aws";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Server Providers</h2>
          <p className="text-sm text-text-muted mt-0.5">Connect cloud providers used for deployments.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)} iconLeft={<PlusIcon className="size-4" />}>
            Add Provider
          </Button>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); resetAddForm(); }} title="Add Provider">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="provider-type" className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
            <SearchableCombobox
              id="provider-type"
              value={addProviderKind}
              onValueChange={(provider) => setAddProviderKind(provider as ProviderKind)}
              options={[
                { value: "aws", label: "AWS" },
                { value: "gcp", label: "Google Cloud" },
              ]}
              placeholder="Select provider"
            />
          </div>
          <div>
            <label htmlFor="provider-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
            <Input id="provider-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          </div>

          {addProviderKind === "aws" ? (
            <>
              <div>
                <label htmlFor="provider-access-key-id" className="block text-sm font-medium text-text-secondary mb-1.5">Access Key ID</label>
                <Input id="provider-access-key-id" type="text" autoComplete="off" placeholder="AKIA…"
                  value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="provider-secret-access-key" className="block text-sm font-medium text-text-secondary mb-1.5">Secret Access Key</label>
                <div className="relative">
                  <Input id="provider-secret-access-key" type={showSecret ? "text" : "password"} autoComplete="off" className="pr-10"
                    value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} required />
                  <button type="button" onClick={() => setShowSecret(!showSecret)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary transition-colors"
                    aria-label={showSecret ? "Hide secret access key" : "Show secret access key"}>
                    {showSecret ? <EyeOffIcon className="size-4.5" /> : <EyeIcon className="size-4.5" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="provider-sa-key" className="block text-sm font-medium text-text-secondary mb-1.5">Service Account Key (JSON)</label>
              <Textarea id="provider-sa-key" rows={6} autoComplete="off" className="font-mono text-xs"
                placeholder={'{\n  "type": "service_account",\n  "project_id": "…",\n  "private_key": "…"\n}'}
                value={form.serviceAccountKey} onChange={(e) => setForm({ ...form, serviceAccountKey: e.target.value })} required />
              <p className="text-xs text-text-muted mt-1.5">Paste the full service-account JSON key from the Google Cloud console.</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit">Add Provider</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingProvider} onClose={() => setEditingProvider(null)} title={editingProvider ? getProviderStyle(editingProvider.provider).name || editingProvider.provider : "Provider"} size="lg">
        {editingProvider && (
            <form onSubmit={handleEditSave} className="space-y-5">
              {/* Hero header */}
              <SettingsHeroHeader
                icon={<ProviderBadge provider={editingProvider.provider} showName={false} iconSize="w-10 h-10" />}
                title={getProviderStyle(editingProvider.provider).name || editingProvider.provider}
                description={getProviderStyle(editingProvider.provider).description}
              />

              {/* Metadata bar */}
              <MetadataBar
                items={[
                  { label: "Added", value: editingProvider.createdAt ? new Date(editingProvider.createdAt).toLocaleDateString() : "—" },
                  { label: "Status", value: <span className={editEnabled ? "text-success-500" : "text-text-muted"}>{editEnabled ? "Connected" : "Disabled"}</span> },
                  { label: "Provider", value: <span className="capitalize">{editingProvider.provider}</span> },
                ]}
                action={
                  <button id="edit-provider-enabled" type="button" onClick={() => setEditEnabled(!editEnabled)}
                    className={`px-4 py-1.5 rounded-(--radius-btn) text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-primary-foreground hover:bg-primary-600"}`}>
                    {editEnabled ? "Disable" : "Enable"}
                  </button>
                }
              />

              {/* Configuration */}
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                <div>
                  <label htmlFor="edit-provider-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
                  <Input id="edit-provider-label" type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} required />
                </div>

                {editKind === "aws" ? (
                  <>
                    <div>
                      <label htmlFor="edit-provider-access-key-id" className="block text-sm font-medium text-text-secondary mb-1.5">Access Key ID</label>
                      <Input id="edit-provider-access-key-id" type="text" autoComplete="off" placeholder="Leave blank to keep current"
                        value={editForm.accessKeyId} onChange={(e) => setEditForm({ ...editForm, accessKeyId: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="edit-provider-secret-access-key" className="block text-sm font-medium text-text-secondary mb-1.5">Secret Access Key</label>
                      <div className="relative">
                        <Input id="edit-provider-secret-access-key" type={showSecret ? "text" : "password"} autoComplete="off" className="pr-10" placeholder="Leave blank to keep current"
                          value={editForm.secretAccessKey} onChange={(e) => setEditForm({ ...editForm, secretAccessKey: e.target.value })} />
                        <button type="button" onClick={() => setShowSecret(!showSecret)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary transition-colors"
                          aria-label={showSecret ? "Hide secret access key" : "Show secret access key"}>
                          {showSecret ? <EyeOffIcon className="size-4.5" /> : <EyeIcon className="size-4.5" />}
                        </button>
                      </div>
                      <p className="text-xs text-text-muted mt-1.5">To rotate credentials, enter the new access key id and secret. Leaving these blank keeps the existing ones.</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label htmlFor="edit-provider-sa-key" className="block text-sm font-medium text-text-secondary mb-1.5">Service Account Key (JSON)</label>
                    <Textarea id="edit-provider-sa-key" rows={6} autoComplete="off" className="font-mono text-xs" placeholder="Leave blank to keep current"
                      value={editForm.serviceAccountKey} onChange={(e) => setEditForm({ ...editForm, serviceAccountKey: e.target.value })} />
                    <p className="text-xs text-text-muted mt-1.5">To rotate credentials, paste a new service-account JSON key. Leaving this blank keeps the existing one.</p>
                  </div>
                )}
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
            <div key={p.id} {...clickableProps(() => openEdit(p), canManage)} className={canManage ? settingsCardInteractiveCls : settingsCardCls}>
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

/** Map a stored provider string to the supported credential kind. */
function normalizeProviderKind(provider: string): ProviderKind {
  return provider.toLowerCase() === "aws" ? "aws" : "gcp";
}
