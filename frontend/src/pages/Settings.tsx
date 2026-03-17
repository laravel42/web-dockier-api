import { useState, useEffect } from "react";
import { authApi, deployApi, gitApi, usersApi, rolesApi, notificationsApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { countries } from "../data/countries";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";

type Tab = "profile" | "security" | "roles" | "providers" | "source-control" | "channels";

const inputCls = "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";
const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
const btnDanger = "text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("profile");
  const tabCls = (active: boolean) => `h-9 px-4 text-sm font-medium rounded-[var(--radius-btn)] transition-colors ${active ? "bg-primary-500 text-white" : "text-text-secondary hover:bg-secondary-50"}`;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text mb-6">Settings</h1>
      <div className="flex gap-2 mb-6" role="tablist">
        {([["profile", "Profile"], ["security", "Security"], ["roles", "Roles"], ["providers", "Providers"], ["source-control", "Source Control"], ["channels", "Notification Channels"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={tabCls(tab === key)}>{label}</button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "providers" && <ProvidersTab />}
      {tab === "source-control" && <SourceControlTab />}
      {tab === "channels" && <NotificationChannelsTab />}
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
        <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
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
            <button type="submit" disabled={loading} className="h-9 px-4 bg-success-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-success-700 disabled:opacity-50 transition-colors">
              {loading ? "Verifying..." : "Enable 2FA"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sections = ["users", "deployments", "notifications", "settings", "roles", "providers", "source_control"];
  const actions = ["view", "create", "edit", "delete"];

  const togglePerm = (key: string) => setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleSection = (section: string) => {
    const allOn = actions.every((a) => perms[`${section}.${a}`]);
    const updated = { ...perms };
    actions.forEach((a) => { updated[`${section}.${a}`] = !allOn; });
    setPerms(updated);
  };

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await rolesApi.list(); setRoles(res.roles.filter((r: any) => r && r.name)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: "", description: "" });
    setPerms({});
    setShowForm(true);
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    setForm({ name: role.name, description: role.description || "" });
    const p: Record<string, boolean> = {};
    (role.permissions || []).forEach((perm: string) => { p[perm] = true; });
    setPerms(p);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const permissions = Object.entries(perms).filter(([, v]) => v).map(([k]) => k);
    if (editingRole) {
      await rolesApi.update(editingRole.id, { name: form.name, description: form.description, permissions });
    } else {
      await rolesApi.create({ name: form.name, description: form.description, permissions });
    }
    setShowForm(false); setEditingRole(null); setForm({ name: "", description: "" }); setPerms({}); fetch_();
  };

  const formatPerm = (p: string) => {
    const [section, action] = p.split(".");
    if (!section || !action) return null;
    return `${section.replace("_", " ")}:${action}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Roles</h2>
        <button onClick={openCreate} className={btnPrimary}>Add Role</button>
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditingRole(null); }} title={editingRole ? "Edit Role" : "Add Role"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="role-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input id="role-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="role-desc" className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
            <input id="role-desc" type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
          </div>
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Permissions</p>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase">Section</th>
                    {actions.map((a) => <th key={a} className="px-3 py-2 text-center text-xs font-semibold text-text-muted uppercase w-16">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <tr key={section} className="border-t border-border">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => toggleSection(section)} className="text-sm font-medium text-text capitalize hover:text-primary-500 transition-colors">
                          {section.replace("_", " ")}
                        </button>
                      </td>
                      {actions.map((action) => {
                        const key = `${section}.${action}`;
                        return (
                          <td key={key} className="px-3 py-2 text-center">
                            <input type="checkbox" checked={!!perms[key]} onChange={() => togglePerm(key)}
                              className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500/20" />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <button type="submit" className={btnPrimary}>{editingRole ? "Save Changes" : "Create Role"}</button>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 text-primary-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-bold text-text">{r.name}</p>
                  <p className="text-sm text-text-secondary mt-0.5">{r.description}</p>
                  {r.permissions?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.permissions.filter((p: string) => p && p.includes(".")).map((p: string) => (
                        <span key={p} className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded text-xs font-medium">{formatPerm(p)}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(r)} className="text-sm text-primary-500 hover:text-primary-700 font-medium transition-colors">Edit</button>
                <button onClick={() => setDeleteId(r.id)} className={btnDanger}>Remove</button>
              </div>
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
  const [editLabel, setEditLabel] = useState("");
  const [form, setForm] = useState({ provider: "digitalocean", label: "", apiKey: "", apiSecret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await deployApi.listProviders(); setProviders(res.providers); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const apiKeyOnlyProviders = ["digitalocean", "hetzner", "vultr", "linode", "hostinger"];
  const isUpCloud = form.provider === "upcloud";
  const isKatapult = form.provider === "katapult";
  const needsSecret = !apiKeyOnlyProviders.includes(form.provider) && !isUpCloud && !isKatapult;

  const credLabel1 = isUpCloud ? "Username" : "API Key";
  const credLabel2 = isUpCloud ? "Password" : isKatapult ? "Organization ID" : "API Secret";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await deployApi.addProvider({ provider: form.provider, label: form.label, apiKey: form.apiKey, apiSecret: (needsSecret || isUpCloud || isKatapult) ? form.apiSecret : "" });
    setShowForm(false); setForm({ provider: "digitalocean", label: "", apiKey: "", apiSecret: "" }); fetch_();
  };

  const openEdit = (p: any) => {
    setEditingProvider(p);
    setEditLabel(p.label);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    await deployApi.updateProvider(editingProvider.id, { label: editLabel });
    setEditingProvider(null); setEditLabel(""); fetch_();
  };

  const providerIcons: Record<string, React.ReactNode> = {
    digitalocean: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.9 2 12.93c0 .1.004.2.006.3h4.08c-.003-.1-.006-.2-.006-.3 0-3.54 3.07-6.27 6.72-5.63 2.35.41 4.26 2.32 4.67 4.67.64 3.65-2.09 6.72-5.63 6.72-.1 0-.2-.003-.3-.006v4.08c.1.002.2.006.3.006C17.52 22.77 22.42 17.52 22 12c-.4-5.16-4.84-9.6-10-10zM12 17.77v-3.04H8.96v3.04H12zm-3.04 0H6.65v-2.31h2.31v2.31z"/>
      </svg>
    ),
    hetzner: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M3 3h4v18H3V3zm14 0h4v18h-4V3zM7 11h10v2H7v-2z"/>
      </svg>
    ),
    vultr: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M18.6 2H22L12.8 22h-3.4L5.2 12.8h3.4l2.8 5.8L18.6 2zM8.2 2h3.4l-3 6.2H5.2L8.2 2zM2 2h3.4L2.4 8.2H2V2z"/>
      </svg>
    ),
    linode: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12.11 2L4 8.56l2.09 1.87 3.17-2.27.28 3.67-2.9.6L8.5 14.8l3.2-.88.3 4.2-2.6.7 1.5 3.18L19.5 14l-2.1-1.7-2.8 2.1-.3-3.8 2.7-.5-1.6-2.3-3 .8-.3-4 2.5-.6L12.11 2z"/>
      </svg>
    ),
    aws: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M6.763 10.036a4.584 4.584 0 00-.198 1.378c0 .676.154 1.283.465 1.822a3.14 3.14 0 00.296.41c.056.056.084.126.084.21 0 .084-.042.168-.126.252-.282.252-.62.465-.62.465-.07.042-.14.07-.196.07-.084 0-.168-.042-.252-.112A4.57 4.57 0 015.2 12.87a5.49 5.49 0 01-.465-2.282c0-.816.14-1.563.437-2.24a5.14 5.14 0 011.26-1.822c.548-.506 1.19-.898 1.934-1.176A7.16 7.16 0 0110.87 5c.886 0 1.716.14 2.492.422.774.282 1.436.676 1.99 1.176l-.87.87c-.168.168-.366.252-.578.252-.14 0-.31-.056-.506-.168a4.29 4.29 0 00-2.528-.802c-1.148 0-2.1.38-2.856 1.134-.758.758-1.134 1.716-1.134 2.87 0 .098-.042.182-.112.282zM18.48 16.1c.394-.31.59-.7.59-1.176 0-.534-.24-.954-.716-1.26-.478-.31-1.134-.464-1.976-.464h-.394c-.14 0-.24-.028-.296-.084-.056-.056-.084-.154-.084-.296v-.534c0-.14.028-.24.084-.296.056-.056.154-.084.296-.084h.394c.73 0 1.302-.14 1.716-.422.416-.282.62-.676.62-1.176 0-.45-.168-.802-.506-1.064-.338-.26-.786-.394-1.344-.394-.534 0-1.022.126-1.456.38l-.45.31c-.084.056-.168.084-.252.084-.14 0-.252-.07-.338-.21l-.394-.59c-.056-.084-.084-.168-.084-.252 0-.112.056-.21.168-.296.45-.366.97-.648 1.554-.842A5.62 5.62 0 0117.4 7.05c1.008 0 1.822.24 2.436.716.618.478.926 1.12.926 1.934 0 .478-.14.912-.422 1.302-.282.394-.662.69-1.134.898.562.196 1.008.506 1.33.926.324.422.486.912.486 1.47 0 .87-.338 1.568-1.008 2.086-.674.52-1.554.786-2.646.786-.66 0-1.274-.098-1.85-.296a4.9 4.9 0 01-1.554-.842c-.112-.084-.168-.182-.168-.296 0-.084.028-.168.084-.252l.394-.59c.084-.14.196-.21.338-.21.084 0 .168.028.252.084l.506.338c.478.282 1.022.422 1.638.422.618 0 1.106-.14 1.47-.422z"/>
      </svg>
    ),
    upcloud: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 4l-8 8h5v6h6v-6h5L12 4zm-7 12c-1.66 0-3 1.34-3 3s1.34 3 3 3h14c1.66 0 3-1.34 3-3s-1.34-3-3-3H5z"/>
      </svg>
    ),
    katapult: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z"/>
      </svg>
    ),
    hostinger: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M4 4h7v7H4V4zm0 9h7v7H4v-7zm9-9h7v16h-7V4z"/>
      </svg>
    ),
  };

  const providerNames: Record<string, string> = {
    digitalocean: "DigitalOcean",
    hetzner: "Hetzner Cloud",
    vultr: "Vultr",
    linode: "Linode",
    aws: "AWS",
    upcloud: "UpCloud",
    katapult: "Katapult",
    hostinger: "Hostinger",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Server Providers</h2>
        <button onClick={() => setShowForm(true)} className={btnPrimary}>Add Provider</button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Provider">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="provider-type" className="block text-sm font-medium text-text-secondary mb-1.5">Provider</label>
            <select id="provider-type" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={inputCls}>
              <option value="digitalocean">DigitalOcean</option>
              <option value="hetzner">Hetzner Cloud</option>
              <option value="vultr">Vultr</option>
              <option value="linode">Linode</option>
              <option value="aws">AWS</option>
              <option value="upcloud">UpCloud</option>
              <option value="katapult">Katapult</option>
              <option value="hostinger">Hostinger</option>
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
          {(needsSecret || isUpCloud || isKatapult) && <div>
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
          <button type="submit" className={btnPrimary}>Add Provider</button>
        </form>
      </Modal>

      <Modal open={!!editingProvider} onClose={() => setEditingProvider(null)} title="Edit Provider">
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <label htmlFor="edit-provider-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
            <input id="edit-provider-label" type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className={inputCls} required />
          </div>
          <button type="submit" className={btnPrimary}>Save Changes</button>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 text-primary-500">
                  {providerIcons[p.provider] || (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-base font-bold text-text">{providerNames[p.provider] || p.provider} <span className="font-bold">{p.label}</span></p>
                  <p className="text-sm text-text-secondary mt-0.5">Added {new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(p)} className="text-sm text-primary-500 hover:text-primary-700 font-medium transition-colors">Edit</button>
                <button onClick={() => setDeleteId(p.id)} className={btnDanger}>Remove</button>
              </div>
            </div>
          ))}
          {providers.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No server providers configured</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) deployApi.deleteProvider(deleteId).then(fetch_); }} message="Are you sure you want to remove this provider?" />
    </div>
  );
}

function SourceControlTab() {
  const [connections, setConnections] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<any | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [form, setForm] = useState({ provider: "github", personalToken: "", label: "", endpoint: "" });
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    setEditLabel(conn.label);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConn) return;
    await gitApi.updateConnection(editingConn.id, { label: editLabel });
    setEditingConn(null); setEditLabel(""); fetch_();
  };

  const gitIcons: Record<string, React.ReactNode> = {
    github: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    ),
    gitlab: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
      </svg>
    ),
    gitlab_self_hosted: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
      </svg>
    ),
    bitbucket: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M2.65 3A.65.65 0 002 3.72l2.73 16.55a.89.89 0 00.87.73h12.98a.65.65 0 00.65-.55L22 3.72a.65.65 0 00-.65-.72zm11.48 12.65H9.87l-1.04-5.3h6.34z"/>
      </svg>
    ),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Source Control Connections</h2>
        <button onClick={() => setShowForm(true)} className={btnPrimary}>Add Connection</button>
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
          <button type="submit" className={btnPrimary}>Connect</button>
        </form>
      </Modal>

      <Modal open={!!editingConn} onClose={() => setEditingConn(null)} title="Edit Connection">
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <label htmlFor="edit-conn-label" className="block text-sm font-medium text-text-secondary mb-1.5">Label</label>
            <input id="edit-conn-label" type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className={inputCls} required />
          </div>
          <button type="submit" className={btnPrimary}>Save Changes</button>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 text-primary-500">
                  {gitIcons[conn.provider] || (
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93h3v3l4-4-4-4v3H4.07C4.56 6.45 7.93 3.5 12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5v-.57z"/></svg>
                  )}
                </div>
                <div>
                  <p className="text-base font-bold text-text capitalize">{conn.provider.replace("_", " ")} <span className="font-bold">{conn.label}</span></p>
                  {conn.endpoint && <p className="text-sm text-text-secondary mt-0.5">{conn.endpoint}</p>}
                  <p className="text-sm text-text-secondary mt-0.5">Connected {new Date(conn.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(conn)} className="text-sm text-primary-500 hover:text-primary-700 font-medium transition-colors">Edit</button>
                <button onClick={() => setDeleteId(conn.id)} className={btnDanger}>Remove</button>
              </div>
            </div>
          ))}
          {connections.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No source control connections yet. Add one to get started.</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) gitApi.deleteConnection(deleteId).then(fetch_); }} message="Are you sure you want to remove this connection?" />
    </div>
  );
}

function NotificationChannelsTab() {
  const [channels, setChannels] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ type: "email", configValue: "" });
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const configLabel: Record<string, string> = { email: "Email Address", slack: "Slack Webhook URL", webhook: "Webhook URL", in_app: "No configuration needed" };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Notification Channels</h2>
        <button onClick={() => setShowForm(true)} className={btnPrimary}>Add Channel</button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Channel">
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
          <button type="submit" className={btnPrimary}>Add Channel</button>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => {
            const channelIcons: Record<string, React.ReactNode> = {
              email: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              ),
              slack: (
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z"/>
                </svg>
              ),
              webhook: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              ),
              in_app: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              ),
            };
            const channelNames: Record<string, string> = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" };
            const configDisplay = ch.type === "email" ? ch.config.email : ch.type === "slack" ? ch.config.webhookUrl : ch.type === "webhook" ? ch.config.url : "";
            return (
            <div key={ch.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 text-primary-500">
                  {channelIcons[ch.type] || channelIcons.in_app}
                </div>
                <div>
                  <p className="text-base font-bold text-text">{channelNames[ch.type] || ch.type}</p>
                  {configDisplay && <p className="text-sm text-text-secondary mt-0.5">{configDisplay}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => notificationsApi.toggleChannel(ch.id, !ch.enabled).then(fetch_)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${ch.enabled ? "bg-success-50 text-success-500" : "bg-secondary-100 text-text-muted"}`}>
                  {ch.enabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => setDeleteId(ch.id)} className={btnDanger}>Remove</button>
              </div>
            </div>
            );
          })}
          {channels.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No notification channels configured</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) notificationsApi.deleteChannel(deleteId).then(fetch_); }} message="Are you sure you want to remove this channel?" />
    </div>
  );
}
