import { useState } from "react";
import { INTEGRATION_CATALOG, CATEGORY_COLORS } from "../../data/integrations";
import { INTEGRATION_ICONS } from "../../data/integration-icons";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import TechBadge from "../../components/TechBadge";
import { inputCls, btnPrimary, btnDanger } from "../../utils/styles";

interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
}

export default function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integration[]>(() => {
    try {
      const stored = localStorage.getItem("integrations");
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
  });
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

  const persist = (items: Integration[]) => {
    setIntegrations(items);
    localStorage.setItem("integrations", JSON.stringify(items));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    const catalog = INTEGRATION_CATALOG.find(c => c.type === selectedType);
    if (!catalog) return;
    setSaving(true);
    const newItem: Integration = {
      id: crypto.randomUUID(),
      type: selectedType,
      name: catalog.name,
      config: { ...formConfig },
      enabled: true,
    };
    persist([...integrations, newItem]);
    setSaving(false);
    setShowAdd(false);
    setSelectedType(null);
    setFormConfig({});
  };

  const openEdit = (intg: Integration) => {
    setEditingIntg(intg);
    setEditConfig({ ...intg.config });
    setEditEnabled(intg.enabled);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIntg) return;
    persist(integrations.map(i => i.id === editingIntg.id ? { ...i, config: { ...editConfig }, enabled: editEnabled } : i));
    setEditingIntg(null);
    setEditConfig({});
  };

  const openAdd = () => {
    setShowAdd(true);
    setSelectedType(null);
    setFormConfig({});
  };

  const catalog = selectedType ? INTEGRATION_CATALOG.find(c => c.type === selectedType) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Integrations</h2>
          <p className="text-sm text-text-secondary mt-0.5">Connect external services like databases, caches, storage, and more.</p>
        </div>
        <button onClick={openAdd} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Integration
        </button>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Integration" size="xl">
        {!selectedType ? (
          <div className="flex gap-4">
            {/* Sidebar filters */}
            <div className="w-44 shrink-0 border-r border-border pr-4">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Categories</p>
              <label className="flex items-center gap-2 py-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={categoryFilter.length === 0}
                  onChange={() => setCategoryFilter([])}
                  className="w-3.5 h-3.5 rounded border-border text-primary-500 focus:ring-primary-500/20 cursor-pointer"
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
                      className="w-3.5 h-3.5 rounded border-border text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                    />
                    <span className={`text-sm ${checked ? "font-medium text-text" : "text-text-secondary group-hover:text-text"}`}>{c}</span>
                  </label>
                );
              })}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search integrations..."
                className={inputCls}
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
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                      {INTEGRATION_ICONS[cat.type] ? <TechBadge name={cat.type} icon={INTEGRATION_ICONS[cat.type]} iconOnly iconSize="w-5 h-5" /> : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" /></svg>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{cat.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[cat.category] || "bg-secondary-100 text-text-muted"}`}>{cat.category}</span>
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
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                {INTEGRATION_ICONS[catalog.type] ? <TechBadge name={catalog.type} icon={INTEGRATION_ICONS[catalog.type]} iconOnly iconSize="w-5 h-5" /> : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" /></svg>}
              </div>
              <div>
                <p className="text-sm font-semibold text-text">{catalog.name}</p>
                <p className="text-xs text-text-muted">{catalog.description}</p>
              </div>
              <button type="button" onClick={() => setSelectedType(null)} className="ml-auto text-xs text-primary-500 hover:text-primary-700 transition-colors">← Back</button>
            </div>
            {catalog.fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`int-${f.key}`} className="block text-sm font-medium text-text-secondary mb-1.5">{f.label}</label>
                {f.options === "dynamic" ? (
                  <input
                    id={`int-${f.key}`}
                    type="text"
                    value={formConfig[f.key] || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, [f.key]: e.target.value })}
                    className={inputCls}
                    placeholder={f.placeholder}
                  />
                ) : Array.isArray(f.options) ? (
                  <select
                    id={`int-${f.key}`}
                    value={formConfig[f.key] || f.options[0]?.value || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, [f.key]: e.target.value })}
                    className={inputCls}
                  >
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    id={`int-${f.key}`}
                    type={f.secret ? "password" : "text"}
                    value={formConfig[f.key] || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, [f.key]: e.target.value })}
                    className={inputCls}
                    placeholder={f.placeholder}
                    required
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
                {saving ? "Saving..." : "Add Integration"}
              </button>
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
                <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0">
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
                  <p className="text-text font-medium mt-0.5">{editCat.category}</p>
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
                    className={`px-4 py-1.5 rounded-[var(--radius-btn)] text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-white hover:bg-primary-600"}`}>
                    {editEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>

              {/* Overview */}
              <div>
                <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{editCat.description}</p>
              </div>

              {/* Configuration fields */}
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                {editCat.fields.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`edit-int-${f.key}`} className="block text-sm font-medium text-text-secondary mb-1.5">{f.label}</label>
                    {f.options === "dynamic" ? (
                      <input
                        id={`edit-int-${f.key}`}
                        type="text"
                        value={editConfig[f.key] || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, [f.key]: e.target.value })}
                        className={inputCls}
                        placeholder={f.placeholder}
                      />
                    ) : Array.isArray(f.options) ? (
                      <select
                        id={`edit-int-${f.key}`}
                        value={editConfig[f.key] || f.options[0]?.value || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, [f.key]: e.target.value })}
                        className={inputCls}
                      >
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input
                        id={`edit-int-${f.key}`}
                        type={f.secret ? "password" : "text"}
                        value={editConfig[f.key] || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, [f.key]: e.target.value })}
                        className={inputCls}
                        placeholder={f.placeholder}
                        required
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button type="button" onClick={() => setConfirmRemove(true)} className={btnDanger}>Remove</button>
                <button type="submit" className={btnPrimary}>Save Changes</button>
              </div>
            </form>
          );
        })()}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingIntg) persist(integrations.filter(i => i.id !== editingIntg.id)); setEditingIntg(null); setConfirmRemove(false); }} message="Are you sure you want to remove this integration?" />

      {integrations.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {integrations.map((intg) => {
            const cat = INTEGRATION_CATALOG.find(c => c.type === intg.type);
            return (
              <div key={intg.id} onClick={() => openEdit(intg)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 flex items-center justify-center shrink-0">
                    {(cat && INTEGRATION_ICONS[cat.type]) ? <TechBadge name={cat.type} icon={INTEGRATION_ICONS[cat.type]} iconOnly iconSize="w-7 h-7" /> : null}
                  </div>
                  <p className="text-sm font-bold text-text">{intg.name}</p>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${intg.enabled ? "bg-success-50 text-success-500" : "bg-secondary-100 text-text-muted"}`}>
                  {intg.enabled ? "Enabled" : "Disabled"}
                </span>
                {cat && <p className="text-xs text-text-muted mt-2">{cat.description}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto text-text-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="text-sm text-text-muted">No integrations configured yet. Add one to connect external services like databases, caches, or storage.</p>
        </div>
      )}
    </div>
  );
}
