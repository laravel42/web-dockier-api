import { useState, useEffect } from "react";
import { authApi, deployApi, gitApi, usersApi, rolesApi, notificationsApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { countries } from "../data/countries";
import { INTEGRATION_CATALOG, CATEGORY_COLORS } from "../data/integrations";
import { INTEGRATION_ICONS } from "../data/integration-icons";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import RoleFormModal from "../components/RoleFormModal";
import DevIcon from "../components/DevIcon";

type Tab = "general" | "profile" | "security" | "roles" | "providers" | "ssh-keys" | "source-control" | "channels" | "integrations";

const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";
const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
const btnDanger = "text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("general");
  const tabCls = (active: boolean) => `h-9 px-4 text-sm font-medium rounded-[var(--radius-btn)] transition-colors ${active ? "bg-primary-500 text-white" : "text-text-secondary hover:bg-secondary-50"}`;

  return (
    <div>
      <h1 className="text-2xl font-display font-semibold text-text mb-8 tracking-tight">Settings</h1>
      <div className="flex gap-2 mb-6" role="tablist">
        {([["general", "General"], ["profile", "Profile"], ["security", "Security"], ["roles", "Roles"], ["providers", "Providers"], ["ssh-keys", "SSH Keys"], ["source-control", "Source Control"], ["channels", "Notification Channels"], ["integrations", "Integrations"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={tabCls(tab === key)}>{label}</button>
        ))}
      </div>
      {tab === "general" && <GeneralTab />}
      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "providers" && <ProvidersTab />}
      {tab === "ssh-keys" && <SshKeysTab />}
      {tab === "source-control" && <SourceControlTab />}
      {tab === "channels" && <NotificationChannelsTab />}
      {tab === "integrations" && <IntegrationsTab />}
    </div>
  );
}

function GeneralTab() {
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Load saved model from localStorage
    const saved = localStorage.getItem("bedrock_default_model");
    if (saved) setSelectedModel(saved);

    // Fetch available models
    gitApi.listBedrockModels()
      .then((res) => setModels(res.models))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    localStorage.setItem("bedrock_default_model", selectedModel);
    setMessage("Default LLM saved");
    setSaving(false);
    setTimeout(() => setMessage(""), 2000);
  };

  return (
    <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 max-w-lg">
      <h2 className="text-base font-semibold text-text mb-1">Default LLM</h2>
      <p className="text-sm text-text-secondary mb-5">Select the Amazon Bedrock model used for AI features across the platform (security fixes, code analysis, etc.).</p>
      {message && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-primary-50 text-primary-600 text-sm" role="status">{message}</div>}
      <div className="space-y-4">
        <div>
          <label htmlFor="default-model" className="block text-sm font-medium text-text-secondary mb-1.5">Bedrock Model</label>
          {loading ? (
            <div className="flex items-center gap-2 h-11">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-muted">Loading models...</span>
            </div>
          ) : models.length > 0 ? (
            <select id="default-model" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={inputCls}>
              <option value="">Select a model</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-text-muted py-2">Could not load models. Make sure the BedrockApiKey secret is configured.</p>
          )}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving || !selectedModel} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { userId, email: authEmail, userProfile, setUserProfile } = useAuth();
  const [name, setName] = useState(userProfile?.name || "");
  const [email, setEmail] = useState(authEmail || "");
  const [country, setCountry] = useState(userProfile?.country || "");
  const [language, setLanguage] = useState(userProfile?.language || "en");
  const [timezone, setTimezone] = useState(userProfile?.timezone || "UTC");
  const [loading, setLoading] = useState(!userProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId || userProfile) { setLoading(false); return; }
    usersApi.get(userId).then((u) => {
      setName(u.name); setEmail(u.email); setCountry(u.country || ""); setLanguage(u.language || "en"); setTimezone(u.timezone || "UTC");
      setUserProfile({ name: u.name, country: u.country || "", language: u.language || "en", timezone: u.timezone || "UTC" });
    }).catch(() => {
      setEmail(authEmail || "");
    }).finally(() => setLoading(false));
  }, [userId, authEmail, userProfile, setUserProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setMessage("");
    try {
      await usersApi.update(userId, { name, country, language, timezone });
      setUserProfile({ name, country, language, timezone });
      setMessage("Profile updated successfully");
    } catch (err: any) { setMessage(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  const languages = [
    ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"],
    ["it", "Italian"], ["nl", "Dutch"], ["ru", "Russian"], ["zh", "Chinese"], ["ja", "Japanese"],
    ["ko", "Korean"], ["ar", "Arabic"], ["hi", "Hindi"], ["tr", "Turkish"], ["pl", "Polish"],
  ];

  const timezones = [
    "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
    "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
    "Australia/Sydney", "Pacific/Auckland",
  ];

  return (
    <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 max-w-lg">
      <h2 className="text-base font-semibold text-text mb-1">Profile</h2>
      <p className="text-sm text-text-secondary mb-5">Manage your personal information.</p>
      {message && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-primary-50 text-primary-600 text-sm" role="status">{message}</div>}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
          <input id="profile-email" type="email" value={email} className={`${inputCls} bg-secondary-50 text-text-muted cursor-not-allowed`} readOnly />
        </div>
        <div>
          <label htmlFor="profile-country" className="block text-sm font-medium text-text-secondary mb-1.5">Country</label>
          <select id="profile-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
            {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-language" className="block text-sm font-medium text-text-secondary mb-1.5">Language</label>
          <select id="profile-language" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
            {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-timezone" className="block text-sm font-medium text-text-secondary mb-1.5">Timezone</label>
          <select id="profile-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
            {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SecurityTab() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetup2FA = async () => {
    setLoading(true);
    try { const res = await authApi.setup2FA(); setQrCode(res.qrCodeUrl); setSecret(res.secret); }
    catch (err: any) { setMessage(err.message); }
    finally { setLoading(false); }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await authApi.enable2FA(verifyToken); setMessage("2FA enabled successfully"); setQrCode(null); setSecret(null); setVerifyToken(""); }
    catch (err: any) { setMessage(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 max-w-lg">
      <h2 className="text-base font-semibold text-text mb-1">Two-Factor Authentication</h2>
      <p className="text-sm text-text-secondary mb-5">Add an extra layer of security with an authenticator app.</p>
      {message && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-primary-50 text-primary-600 text-sm" role="status">{message}</div>}
      {!qrCode ? (
        <button onClick={handleSetup2FA} disabled={loading} className={`${btnPrimary} disabled:opacity-50`}>
          {loading ? "Setting up..." : "Setup 2FA"}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <img src={qrCode} alt="Scan this QR code with your authenticator app" className="mx-auto" />
            <p className="text-xs text-text-muted mt-2">Or enter manually: <code className="bg-secondary-50 px-2 py-0.5 rounded text-text-secondary">{secret}</code></p>
          </div>
          <form onSubmit={handleEnable2FA} className="space-y-3">
            <div>
              <label htmlFor="verify-token" className="block text-sm font-medium text-text-secondary mb-1.5">Verification Code</label>
              <input id="verify-token" type="text" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className={inputCls} placeholder="Enter 6-digit code" required />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="h-9 px-4 bg-success-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-success-700 disabled:opacity-50 transition-colors">
                {loading ? "Verifying..." : "Enable 2FA"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<any[]>([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await rolesApi.list(); setRoles(res.roles.filter((r: any) => r && r.name)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const handleCreateRole = async (data: { name: string; description: string; permissions: string[] }) => {
    await rolesApi.create(data);
    setShowRoleModal(false); fetch_();
  };

  const formatPerm = (p: string) => {
    if (p.includes(":")) return p;
    const [section, action] = p.split(".");
    if (!section || !action) return p;
    return `${section.replace("_", " ")}:${action}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Roles</h2>
        <button onClick={() => setShowRoleModal(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Role
        </button>
      </div>

      <RoleFormModal open={showRoleModal} onClose={() => setShowRoleModal(false)} onSubmit={handleCreateRole} />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-primary-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-bold text-text">{r.name}</p>
                  <p className="text-sm text-text-secondary mt-0.5">{r.description}</p>
                  {r.permissions?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.permissions.map((p: string) => (
                        <span key={p} className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded text-xs font-medium">{formatPerm(p)}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setDeleteId(r.id)} className={btnDanger}>Remove</button>
            </div>
          ))}
          {roles.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No roles configured yet</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) rolesApi.delete(deleteId).then(fetch_); }} message="Are you sure you want to remove this role?" />
    </div>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ label: "", apiKey: "", apiSecret: "" });
  const [editEnabled, setEditEnabled] = useState(true);
  const [form, setForm] = useState({ provider: "aws", label: "", apiKey: "", apiSecret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await deployApi.listProviders(); setProviders(res.providers); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const apiKeyOnlyProviders = ["digitalocean"];
  const needsSecret = !apiKeyOnlyProviders.includes(form.provider) && !["hetzner", "linode"].includes(form.provider);

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

  const openEdit = (p: any) => {
    setEditingProvider(p);
    setEditForm({ label: p.label, apiKey: p.apiKey || "", apiSecret: p.apiSecret || "" });
    setEditEnabled(p.enabled !== false);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    await deployApi.updateProvider(editingProvider.id, { label: editForm.label });
    setEditingProvider(null); fetch_();
  };

  const providerDescriptions: Record<string, string> = {
    aws: "Amazon Web Services cloud platform.",
    googlecloud: "Google Cloud Platform infrastructure.",
    digitalocean: "Cloud VPS and managed infrastructure.",
    hetzner: "High-performance cloud servers in Europe.",
    linode: "Simple and reliable cloud computing.",
  };

  const providerIconUrls: Record<string, string> = {
    aws: "i/aws.svg",
    googlecloud: "googlecloud",
    digitalocean: "digitalocean",
    hetzner: "hetzner",
    linode: "linode",
  };

  const providerNames: Record<string, string> = {
    aws: "AWS",
    googlecloud: "Google Cloud",
    digitalocean: "DigitalOcean",
    hetzner: "Hetzner",
    linode: "Linode",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Server Providers</h2>
        <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Provider
        </button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Provider">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="provider-type" className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
            <select id="provider-type" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={inputCls}>
              <option value="aws">AWS</option>
              <option value="googlecloud">Google Cloud</option>
              <option value="digitalocean">DigitalOcean</option>
              <option value="hetzner">Hetzner</option>
              <option value="linode">Linode</option>
            </select>
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
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5">
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

      <Modal open={!!editingProvider} onClose={() => setEditingProvider(null)} title={editingProvider ? providerNames[editingProvider.provider] || editingProvider.provider : "Provider"} size="lg">
        {editingProvider && (
            <form onSubmit={handleEditSave} className="space-y-5">
              {/* Hero header */}
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0">
                  {providerIconUrls[editingProvider.provider] ? <DevIcon src={providerIconUrls[editingProvider.provider]} className="w-10 h-10" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-text">{providerNames[editingProvider.provider] || editingProvider.provider}</p>
                  <p className="text-sm text-text-muted">{providerDescriptions[editingProvider.provider] || "Cloud infrastructure provider."}</p>
                </div>
              </div>

              {/* Metadata bar */}
              <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
                <div>
                  <span className="uppercase tracking-wide text-text-muted font-semibold">Added</span>
                  <p className="text-text font-medium mt-0.5">{new Date(editingProvider.createdAt).toLocaleDateString()}</p>
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
                    className={`px-4 py-1.5 rounded-[var(--radius-btn)] text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-white hover:bg-primary-600"}`}>
                    {editEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>

              {/* Overview */}
              <div>
                <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{providerDescriptions[editingProvider.provider] || "Cloud infrastructure provider."}</p>
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
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {providers.map((p) => (
            <div key={p.id} onClick={() => openEdit(p)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  {providerIconUrls[p.provider] ? <DevIcon src={providerIconUrls[p.provider]} className="w-7 h-7" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text truncate">{providerNames[p.provider] || p.provider}</p>
                  <p className="text-xs text-text-muted truncate">{p.label}</p>
                </div>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${p.enabled !== false ? "bg-success-50 text-success-500" : "bg-secondary-100 text-text-muted"}`}>{p.enabled !== false ? "Connected" : "Disabled"}</span>
              <p className="text-xs text-text-muted mt-2">{providerDescriptions[p.provider] || "Cloud infrastructure provider."}</p>
            </div>
          ))}
          {providers.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No server providers configured</p>}
        </div>
      )}
    </div>
  );
}

function SshKeysTab() {
  const [keys, setKeys] = useState<Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", publicKey: "" });
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchKeys = async () => {
    setLoading(true);
    try { const res = await deployApi.listSshKeys(); setKeys(res.keys); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await deployApi.addSshKey({ label: form.label, publicKey: form.publicKey });
      setShowForm(false);
      setForm({ label: "", publicKey: "" });
      fetchKeys();
    } catch (err: any) {
      setError(err.message || "Failed to add SSH key");
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
          <p className="text-sm text-text-muted mt-0.5">SSH keys used for VPS deployments (Hetzner, Vultr, Linode, AWS EC2)</p>
        </div>
        <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add SSH Key
        </button>
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setError(""); }} title="Add SSH Key">
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
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Add Key</button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
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
          {keys.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No SSH keys added yet</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) deployApi.deleteSshKey(deleteId).then(fetchKeys); setDeleteId(null); }} message="Are you sure you want to remove this SSH key?" />
    </div>
  );
}

function SourceControlTab() {
  const [connections, setConnections] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ label: "", personalToken: "", endpoint: "" });
  const [form, setForm] = useState({ provider: "github", personalToken: "", label: "", endpoint: "" });
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await gitApi.listConnections(); setConnections(res.connections); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await gitApi.addConnection({ ...form, repoUrl: "" });
    setShowForm(false); setForm({ provider: "github", personalToken: "", label: "", endpoint: "" }); fetch_();
  };

  const openEdit = (conn: any) => {
    setEditingConn(conn);
    setEditForm({ label: conn.label, personalToken: "", endpoint: conn.endpoint || "" });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConn) return;
    await gitApi.updateConnection(editingConn.id, { label: editForm.label });
    setEditingConn(null); fetch_();
  };

  const gitDescriptions: Record<string, string> = {
    github: "GitHub repositories and organizations.",
    gitlab: "GitLab projects and groups.",
    gitlab_self_hosted: "Self-hosted GitLab instance.",
    bitbucket: "Bitbucket repositories and workspaces.",
  };

  const gitIconUrls: Record<string, string> = {
    github: "github",
    gitlab: "gitlab",
    gitlab_self_hosted: "gitlab",
    bitbucket: "bitbucket",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Source Control Connections</h2>
        <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Connection
        </button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Connection">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="git-provider" className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
            <select id="git-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={inputCls}>
              <option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="gitlab_self_hosted">GitLab Self-Hosted</option><option value="bitbucket">Bitbucket</option>
            </select>
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
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0">
                {gitIconUrls[editingConn.provider] ? <DevIcon src={gitIconUrls[editingConn.provider]} className="w-10 h-10" /> : null}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-text capitalize">{editingConn.provider.replace("_", " ")}</p>
                <p className="text-sm text-text-muted">{gitDescriptions[editingConn.provider] || "Source control connection."}</p>
              </div>
            </div>

            {/* Metadata bar */}
            <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Connected</span>
                <p className="text-text font-medium mt-0.5">{new Date(editingConn.createdAt).toLocaleDateString()}</p>
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
              <p className="text-sm text-text-secondary leading-relaxed">{gitDescriptions[editingConn.provider] || "Source control connection."}</p>
            </div>

            {/* Configuration */}
            <div className="border-t border-border pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-text">Configuration</h3>
              <div>
                <label htmlFor="edit-conn-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
                <input id="edit-conn-label" type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label htmlFor="edit-conn-endpoint" className="block text-sm font-medium text-text-secondary mb-1.5">
                  API Endpoint <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input id="edit-conn-endpoint" type="url" value={editForm.endpoint} onChange={(e) => setEditForm({ ...editForm, endpoint: e.target.value })} className={inputCls} placeholder="Leave empty for default" />
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
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingConn) gitApi.deleteConnection(editingConn.id).then(fetch_); setEditingConn(null); setConfirmRemove(false); }} message="Are you sure you want to remove this connection?" />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {connections.map((conn) => (
            <div key={conn.id} onClick={() => openEdit(conn)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  {gitIconUrls[conn.provider] ? <DevIcon src={gitIconUrls[conn.provider]} className="w-7 h-7" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text capitalize truncate">{conn.provider.replace("_", " ")}</p>
                  <p className="text-xs text-text-muted truncate">{conn.label}</p>
                </div>
              </div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-success-50 text-success-500">Connected</span>
              <p className="text-xs text-text-muted mt-2">{gitDescriptions[conn.provider] || "Source control connection."}</p>
            </div>
          ))}
          {connections.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No source control connections yet. Add one to get started.</p>}
        </div>
      )}
    </div>
  );
}

function NotificationChannelsTab() {
  const [channels, setChannels] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ type: "email", configValue: "" });
  const [loading, setLoading] = useState(true);
  const [editingChannel, setEditingChannel] = useState<any | null>(null);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editConfigValue, setEditConfigValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await notificationsApi.listChannels(); setChannels(res.channels); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const config: Record<string, string> = {};
    if (formData.type === "email") config.email = formData.configValue;
    else if (formData.type === "slack") config.webhookUrl = formData.configValue;
    else if (formData.type === "webhook") config.url = formData.configValue;
    await notificationsApi.addChannel({ type: formData.type, config });
    setShowForm(false); setFormData({ type: "email", configValue: "" }); fetch_();
  };

  const openEditChannel = (ch: any) => {
    setEditingChannel(ch);
    setEditEnabled(ch.enabled);
    setEditConfigValue(ch.type === "email" ? ch.config.email || "" : ch.type === "slack" ? ch.config.webhookUrl || "" : ch.type === "webhook" ? ch.config.url || "" : "");
  };

  const handleEditChannelSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    if (editingChannel.enabled !== editEnabled) {
      await notificationsApi.toggleChannel(editingChannel.id, editEnabled);
    }
    setEditingChannel(null); fetch_();
  };

  const channelDescriptions: Record<string, string> = {
    email: "Receive deploy and alert notifications via email.",
    slack: "Post notifications to a Slack channel.",
    webhook: "Send notifications to a custom webhook endpoint.",
    in_app: "View notifications directly in the dashboard.",
  };

  const configLabel: Record<string, string> = { email: "Email Address", slack: "Slack Webhook URL", webhook: "Webhook URL", in_app: "No configuration needed" };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Notification Channels</h2>
        <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Channel
        </button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Channel" compact>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="channel-type" className="block text-sm font-medium text-text-secondary mb-1.5">Channel Type</label>
            <select id="channel-type" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={inputCls}>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
              <option value="in_app">In-App</option>
            </select>
          </div>
          {formData.type !== "in_app" && (
            <div>
              <label htmlFor="channel-config" className="block text-sm font-medium text-text-secondary mb-1.5">{configLabel[formData.type]}</label>
              <input id="channel-config" type="text" value={formData.configValue} onChange={(e) => setFormData({ ...formData, configValue: e.target.value })} className={inputCls} required />
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Add Channel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingChannel} onClose={() => setEditingChannel(null)} title={{ email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" }[editingChannel?.type as string] || editingChannel?.type || "Channel"} size="lg">
        {editingChannel && (() => {
          const chName = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" }[editingChannel.type as string] || editingChannel.type;
          const chIcon = editingChannel.type === "slack" ? <DevIcon src="slack" className="w-10 h-10" /> :
            editingChannel.type === "email" ? <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> :
            editingChannel.type === "webhook" ? <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg> :
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>;
          return (
          <form onSubmit={handleEditChannelSave} className="space-y-5">
            {/* Hero header */}
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-text-secondary">
                {chIcon}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-text">{chName}</p>
                <p className="text-sm text-text-muted">{channelDescriptions[editingChannel.type] || "Notification channel."}</p>
              </div>
            </div>

            {/* Metadata bar */}
            <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Type</span>
                <p className="text-text font-medium mt-0.5">{chName}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Status</span>
                <p className={`font-medium mt-0.5 ${editEnabled ? "text-success-500" : "text-text-muted"}`}>{editEnabled ? "Enabled" : "Disabled"}</p>
              </div>
              <div className="ml-auto">
                <button id="edit-ch-enabled" type="button" onClick={() => setEditEnabled(!editEnabled)}
                  className={`px-4 py-1.5 rounded-[var(--radius-btn)] text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-white hover:bg-primary-600"}`}>
                  {editEnabled ? "Disable" : "Enable"}
                </button>
              </div>
            </div>

            {/* Overview */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{channelDescriptions[editingChannel.type] || "Notification channel."}</p>
            </div>

            {/* Configuration */}
            {editingChannel.type !== "in_app" && (
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                <div>
                  <label htmlFor="edit-ch-config" className="block text-sm font-medium text-text-secondary mb-1.5">{configLabel[editingChannel.type]}</label>
                  <input id="edit-ch-config" type="text" value={editConfigValue} onChange={(e) => setEditConfigValue(e.target.value)} className={inputCls} required />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button type="button" onClick={() => setConfirmRemove(true)} className={btnDanger}>Remove</button>
              <button type="submit" className={btnPrimary}>Save Changes</button>
            </div>
          </form>
          );
        })()}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingChannel) notificationsApi.deleteChannel(editingChannel.id).then(fetch_); setEditingChannel(null); setConfirmRemove(false); }} message="Are you sure you want to remove this channel?" />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {channels.map((ch) => {
            const channelNames: Record<string, string> = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" };
            const channelIcons: Record<string, React.ReactNode> = {
              email: <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
              slack: <DevIcon src="slack" className="w-7 h-7" />,
              webhook: <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>,
              in_app: <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
            };
            return (
            <div key={ch.id} onClick={() => openEditChannel(ch)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0 text-text-secondary">
                  {channelIcons[ch.type] || channelIcons.in_app}
                </div>
                <p className="text-sm font-bold text-text">{channelNames[ch.type] || ch.type}</p>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${ch.enabled ? "bg-success-50 text-success-500" : "bg-secondary-100 text-text-muted"}`}>
                {ch.enabled ? "Enabled" : "Disabled"}
              </span>
              <p className="text-xs text-text-muted mt-2">{channelDescriptions[ch.type] || "Notification channel."}</p>
            </div>
            );
          })}
          {channels.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No notification channels configured</p>}
        </div>
      )}
    </div>
  );
}

interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
}

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Integrations are stored in localStorage for now (no backend endpoint yet)
  useEffect(() => {
    setLoading(true);
    try {
      const stored = localStorage.getItem("integrations");
      if (stored) setIntegrations(JSON.parse(stored));
    } catch {}
    setLoading(false);
  }, []);

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
                      {INTEGRATION_ICONS[cat.type] ? <DevIcon src={INTEGRATION_ICONS[cat.type]} className="w-5 h-5" /> : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" /></svg>}
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
                {INTEGRATION_ICONS[catalog.type] ? <DevIcon src={INTEGRATION_ICONS[catalog.type]} className="w-5 h-5" /> : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" /></svg>}
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
                  {INTEGRATION_ICONS[editCat.type] ? <DevIcon src={INTEGRATION_ICONS[editCat.type]} className="w-10 h-10" /> : null}
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

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : integrations.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {integrations.map((intg) => {
            const cat = INTEGRATION_CATALOG.find(c => c.type === intg.type);
            return (
              <div key={intg.id} onClick={() => openEdit(intg)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 flex items-center justify-center shrink-0">
                    {(cat && INTEGRATION_ICONS[cat.type]) ? <DevIcon src={INTEGRATION_ICONS[cat.type]} className="w-7 h-7" /> : null}
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
