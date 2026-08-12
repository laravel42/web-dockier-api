import { useState } from "react";
import { INTEGRATION_CATALOG, CATEGORY_COLORS, categoryBadgeCls } from "@/data/integrations";
import { INTEGRATION_ICONS } from "@/data/integration-icons";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import SettingsModalFooter from "@/components/SettingsModalFooter";
import { SettingsField } from "@/components/SettingsField";
import TechBadge from "@/components/TechBadge";
import { SearchableCombobox } from "@/components/ui/combobox";
import { settingsBadgeCls, settingsCardGridCls, settingsCardInteractiveCls, settingsCardCls } from "@/utils/styles";
import { Input } from "@/components/ui/input";
import Button from "@/components/ui/Button";
import ListSearchBar from "@/components/ui/ListSearchBar";
import { usePermissions } from "@/context/PermissionsContext";
import { integrationsApi } from "@/services/api";
import { useAsyncData } from "@/hooks/useAsyncData";
import PageLoading from "@/components/ui/PageLoading";
import PageError from "@/components/ui/PageError";
import { PlusIcon, Grid2X2PlusIcon } from "lucide-react";

const PM_TYPES = new Set(["linear", "jira"]);

function isPMType(type: string) {
  return PM_TYPES.has(type);
}

function loadLocalIntegrations(): Integration[] {
  try {
    const stored = localStorage.getItem("integrations");
    if (stored) {
      const all: Integration[] = JSON.parse(stored);
      return all.filter((i) => !isPMType(i.type));
    }
  } catch { /* ignore */ }
  return [];
}

function persistLocalIntegrations(items: Integration[]) {
  localStorage.setItem("integrations", JSON.stringify(items));
}

interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
}

export default function IntegrationsTab() {
  const { has } = usePermissions();
  const canManage = has("credential:manage");
  const { data: pmData, loading, error, reload } = useAsyncData(
    () => integrationsApi.listPMIntegrations().then((res) => res.integrations),
    [],
  );
  const [localIntegrations, setLocalIntegrations] = useState<Integration[]>(loadLocalIntegrations);
  const pmIntegrations: Integration[] = (pmData ?? []).map((i) => ({
    id: i.id,
    type: i.type,
    name: i.name,
    config: i.config ?? {},
    enabled: i.enabled,
  }));
  const integrations = [...pmIntegrations, ...localIntegrations];
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingIntg, setEditingIntg] = useState<Integration | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [editEnabled, setEditEnabled] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    const catalog = INTEGRATION_CATALOG.find(c => c.type === selectedType);
    if (!catalog) return;
    setSaving(true);
    try {
      if (isPMType(selectedType)) {
        await integrationsApi.createPMIntegration({
          provider: selectedType,
          name: catalog.name,
          config: { ...formConfig },
          enabled: true,
        });
        await reload();
      } else {
        const newItem: Integration = {
          id: crypto.randomUUID(),
          type: selectedType,
          name: catalog.name,
          config: { ...formConfig },
          enabled: true,
        };
        const next = [...localIntegrations, newItem];
        setLocalIntegrations(next);
        persistLocalIntegrations(next);
      }
      setShowAdd(false);
      setSelectedType(null);
      setFormConfig({});
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (intg: Integration) => {
    setEditingIntg(intg);
    setEditConfig({ ...intg.config });
    setEditEnabled(intg.enabled);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIntg) return;
    if (isPMType(editingIntg.type)) {
      const hasConfig = Object.values(editConfig).some((v) => v.trim() !== "");
      await integrationsApi.updatePMIntegration(editingIntg.id, {
        config: hasConfig ? { ...editConfig } : undefined,
        enabled: editEnabled,
      });
      await reload();
    } else {
      const next = localIntegrations.map(i =>
        i.id === editingIntg.id ? { ...i, config: { ...editConfig }, enabled: editEnabled } : i,
      );
      setLocalIntegrations(next);
      persistLocalIntegrations(next);
    }
    setEditingIntg(null);
    setEditConfig({});
  };

  const handleRemove = async () => {
    if (!editingIntg) return;
    if (isPMType(editingIntg.type)) {
      await integrationsApi.deletePMIntegration(editingIntg.id);
      await reload();
    } else {
      const next = localIntegrations.filter(i => i.id !== editingIntg.id);
      setLocalIntegrations(next);
      persistLocalIntegrations(next);
    }
    setEditingIntg(null);
    setConfirmRemove(false);
  };

  const openAdd = () => {
    setShowAdd(true);
    setSelectedType(null);
    setFormConfig({});
  };

  const catalog = selectedType ? INTEGRATION_CATALOG.find(c => c.type === selectedType) : null;

  if (loading) return <PageLoading />;
  if (error) return <PageError message={error} onRetry={reload} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Integrations</h2>
          <p className="text-sm text-text-secondary mt-0.5">Connect external services like databases, caches, storage, and more.</p>
        </div>
        {canManage && (
          <Button onClick={openAdd} iconLeft={<PlusIcon className="size-4" />}>
            Add Integration
          </Button>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Integration" size="xl">
        {!selectedType ? (
          <div className="flex flex-col gap-4 md:flex-row">
            {/* Sidebar filters */}
            <div className="shrink-0 border-b border-border pb-3 md:w-44 md:border-b-0 md:border-r md:pb-0 md:pr-4">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Categories</p>
              <label className="flex items-center gap-2 py-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={categoryFilter.length === 0}
                  onChange={() => setCategoryFilter([])}
                  className="size-3.5  rounded border-border text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                />
                <span className={`text-sm ${categoryFilter.length === 0 ? "font-medium text-text" : "text-text-secondary group-hover:text-text"}`}>All</span>
              </label>
              {Object.keys(CATEGORY_COLORS).map((c) => {
                const checked = categoryFilter.includes(c);
                return (
                  <label key={c} className="flex items-center gap-2 py-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setCategoryFilter(checked ? categoryFilter.filter(f => f !== c) : [...categoryFilter, c])}
                      className="size-3.5  rounded border-border text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                    />
                    <span className={`text-sm ${checked ? "font-medium text-text" : "text-text-secondary group-hover:text-text"}`}>{c}</span>
                  </label>
                );
              })}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-3">
              <ListSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search integrations..."
                className="input-enlarge-wrap--wide w-full"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: "none" }}>
              {INTEGRATION_CATALOG
                .filter((cat) => (categoryFilter.length === 0 || categoryFilter.includes(cat.category)) && (!searchQuery || cat.name.toLowerCase().includes(searchQuery.toLowerCase()) || cat.category.toLowerCase().includes(searchQuery.toLowerCase()) || cat.description.toLowerCase().includes(searchQuery.toLowerCase())))
                .map((cat) => {
                const alreadyAdded = integrations.some(i => i.type === cat.type);
                return (
                  <button
                    key={cat.type}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => { setSelectedType(cat.type); setFormConfig({}); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border border-border text-left transition-colors ${alreadyAdded ? "opacity-40 cursor-not-allowed" : "hover:bg-secondary-50 hover:border-primary-300"}`}
                  >
                    <div className="size-9  rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                      {INTEGRATION_ICONS[cat.type] ? <TechBadge name={cat.type} icon={INTEGRATION_ICONS[cat.type]} iconOnly iconSize="w-5 h-5" /> : <Grid2X2PlusIcon className="size-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{cat.name}</span>
                        <span className={categoryBadgeCls(cat.category)}>{cat.category}</span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 truncate">{cat.description}</p>
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        ) : catalog ? (
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="size-9  rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                {INTEGRATION_ICONS[catalog.type] ? <TechBadge name={catalog.type} icon={INTEGRATION_ICONS[catalog.type]} iconOnly iconSize="w-5 h-5" /> : <Grid2X2PlusIcon className="size-5" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-text">{catalog.name}</p>
                <p className="text-xs text-text-muted">{catalog.description}</p>
              </div>
              <button type="button" onClick={() => setSelectedType(null)} className="ml-auto text-xs text-primary-500 hover:text-primary-700 transition-colors">← Back</button>
            </div>
            {catalog.fields.map((f) => (
              <SettingsField key={f.key} id={`int-${f.key}`} label={f.label}>
                {f.options === "dynamic" ? (
                  <Input
                    id={`int-${f.key}`}
                    type="text"
                    value={formConfig[f.key] || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                ) : Array.isArray(f.options) ? (
                  <SearchableCombobox
                    id={`int-${f.key}`}
                    value={formConfig[f.key] || f.options[0]?.value || ""}
                    onValueChange={(v) => setFormConfig({ ...formConfig, [f.key]: v })}
                    options={f.options.map((o) => ({ value: o.value, label: o.label }))}
                    placeholder={`Select ${f.label.toLowerCase()}`}
                  />
                ) : (
                  <Input
                    id={`int-${f.key}`}
                    type={f.secret ? "password" : "text"}
                    value={formConfig[f.key] || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    required
                  />
                )}
              </SettingsField>
            ))}
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} loading={saving}>
                {saving ? "Saving..." : "Add Integration"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!editingIntg} onClose={() => setEditingIntg(null)} title={editingIntg?.name ?? "Integration"} size="lg">
        {editingIntg && (() => {
          const editCat = INTEGRATION_CATALOG.find(c => c.type === editingIntg.type);
          if (!editCat) return null;
          return (
            <form onSubmit={handleEditSave} className="space-y-5">
              {/* Hero header: large icon + name + short description */}
              <div className="flex items-center gap-5">
                <div className="size-14  rounded-xl flex items-center justify-center shrink-0">
                  {INTEGRATION_ICONS[editCat.type] ? <TechBadge name={editCat.type} icon={INTEGRATION_ICONS[editCat.type]} iconOnly iconSize="w-10 h-10" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-text">{editCat.name}</p>
                  <p className="text-sm text-text-muted">{editCat.description}</p>
                </div>
              </div>

              {/* Metadata bar */}
              <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Category</span>
                  <div className="mt-1">
                    <span className={categoryBadgeCls(editCat.category)}>{editCat.category}</span>
                  </div>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Status</span>
                  <p className={`font-medium mt-0.5 ${editEnabled ? "text-success-500" : "text-text-muted"}`}>{editEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Fields</span>
                  <p className="text-text font-medium mt-0.5">{editCat.fields.length} configured</p>
                </div>
                <div className="ml-auto">
                  <button id="edit-intg-enabled" type="button" onClick={() => setEditEnabled(!editEnabled)}
                    className={`px-4 py-1.5 rounded-(--radius-btn) text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-primary-foreground hover:bg-primary-600"}`}>
                    {editEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>

              {/* Overview */}
              <div>
                <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
                <p className="text-sm/relaxed text-text-secondary ">{editCat.description}</p>
              </div>

              {/* Configuration fields */}
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                {editCat.fields.map((f) => (
                  <SettingsField key={f.key} id={`edit-int-${f.key}`} label={f.label}>
                    {f.options === "dynamic" ? (
                      <Input
                        id={`edit-int-${f.key}`}
                        type="text"
                        value={editConfig[f.key] || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                      />
                    ) : Array.isArray(f.options) ? (
                      <SearchableCombobox
                        id={`edit-int-${f.key}`}
                        value={editConfig[f.key] || f.options[0]?.value || ""}
                        onValueChange={(v) => setEditConfig({ ...editConfig, [f.key]: v })}
                        options={f.options.map((o) => ({ value: o.value, label: o.label }))}
                        placeholder={`Select ${f.label.toLowerCase()}`}
                      />
                    ) : (
                      <Input
                        id={`edit-int-${f.key}`}
                        type={f.secret ? "password" : "text"}
                        value={editConfig[f.key] || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, [f.key]: e.target.value })}
                        placeholder={isPMType(editingIntg.type) ? `${f.placeholder} (leave blank to keep)` : f.placeholder}
                        required={!isPMType(editingIntg.type)}
                      />
                    )}
                  </SettingsField>
                ))}
              </div>

              {/* Footer actions */}
              <SettingsModalFooter
                onDelete={canManage ? () => setConfirmRemove(true) : undefined}
                deleteAriaLabel={`Remove ${editingIntg.name}`}
              >
                <Button type="submit">Save Changes</Button>
              </SettingsModalFooter>
            </form>
          );
        })()}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={handleRemove} message="Are you sure you want to remove this integration?" />

      {integrations.length > 0 ? (
        <div className={settingsCardGridCls}>
          {integrations.map((intg) => {
            const cat = INTEGRATION_CATALOG.find(c => c.type === intg.type);
            return (
              <div key={intg.id} onClick={() => canManage && openEdit(intg)} className={canManage ? settingsCardInteractiveCls : settingsCardCls}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="size-8  flex items-center justify-center shrink-0">
                      {(cat && INTEGRATION_ICONS[cat.type]) ? <TechBadge name={cat.type} icon={INTEGRATION_ICONS[cat.type]} iconOnly iconSize="w-7 h-7" /> : null}
                    </div>
                    <p className="text-sm font-semibold text-text truncate">{intg.name}</p>
                  </div>
                  <span className={`shrink-0 ${intg.enabled ? settingsBadgeCls.success : settingsBadgeCls.muted}`}>
                    {intg.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {cat && <p className="text-xs text-text-muted">{cat.description}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card rounded-card shadow-(--shadow-card) p-12 text-center">
          <Grid2X2PlusIcon className="size-10 mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No integrations configured yet. Add one to connect external services like databases, caches, or storage.</p>
        </div>
      )}
    </div>
  );
}
