import { useState, useEffect } from "react";
import { usersApi, rolesApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import ComboBox from "../../components/ComboBox";
import { inputCls, btnPrimary } from "../../utils/styles";
import ListSearchBar from "../../components/ui/ListSearchBar";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import Alert from "../../components/ui/Alert";
import { getErrorMessage } from "../../utils/errors";
import { useToast } from "../../context/useToast";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../context/PermissionsContext";

interface UserItem {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  createdAt: string;
}

interface RoleItem {
  id: string;
  name: string;
  description: string;
  systemKey: string | null;
  isSystem: boolean;
  isEditable: boolean;
  isDeletable: boolean;
  permissions: string[];
}

export default function UsersTab() {
  const { userId } = useAuth();
  const toast = useToast();
  const { has, refresh: refreshPermissions } = usePermissions();
  const canManage = has("user:manage");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", password: "", language: "en", timezone: "", roleId: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editRoleId, setEditRoleId] = useState("");
  const [editName, setEditName] = useState("");
  const [editLanguage, setEditLanguage] = useState("en");
  const [editTimezone, setEditTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [usersRes, rolesRes] = await Promise.all([
        usersApi.list({ search: search || undefined }),
        rolesApi.list(),
      ]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to load users"));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSearch = () => fetchData();

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pw = "";
    // Ensure at least one of each required type
    pw += "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
    pw += "abcdefghijkmnpqrstuvwxyz"[Math.floor(Math.random() * 23)];
    pw += "23456789"[Math.floor(Math.random() * 8)];
    pw += "!@#$%&*"[Math.floor(Math.random() * 7)];
    for (let i = 4; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    // Shuffle
    const arr = pw.split("");
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    setInviteForm(f => ({ ...f, password: arr.join("") }));
    setShowPassword(true);
  };

  const passwordChecks = {
    length: inviteForm.password.length >= 8,
    upper: /[A-Z]/.test(inviteForm.password),
    lower: /[a-z]/.test(inviteForm.password),
    number: /[0-9]/.test(inviteForm.password),
    special: /[^A-Za-z0-9]/.test(inviteForm.password),
  };
  const passwordValid = !inviteForm.password || Object.values(passwordChecks).every(Boolean);

  const tzToCountry: Record<string, string> = {
    "UTC": "", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
    "America/Los_Angeles": "US", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX",
    "America/Toronto": "CA", "America/Vancouver": "CA", "America/Buenos_Aires": "AR",
    "America/Santiago": "CL", "America/Bogota": "CO", "America/Lima": "PE",
    "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Rome": "IT",
    "Europe/Madrid": "ES", "Europe/Moscow": "RU", "Europe/Amsterdam": "NL",
    "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK",
    "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Lisbon": "PT",
    "Europe/Istanbul": "TR", "Europe/Zurich": "CH", "Europe/Vienna": "AT",
    "Europe/Brussels": "BE", "Europe/Dublin": "IE", "Europe/Prague": "CZ",
    "Europe/Bucharest": "RO", "Europe/Athens": "GR", "Europe/Budapest": "HU",
    "Asia/Dubai": "AE", "Asia/Kolkata": "IN", "Asia/Shanghai": "CN",
    "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Singapore": "SG",
    "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW", "Asia/Bangkok": "TH",
    "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Tel_Aviv": "IL",
    "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU",
    "Pacific/Auckland": "NZ", "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG",
    "Africa/Cairo": "EG",
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteForm.password && !passwordValid) { setInviteError("Password does not meet requirements"); return; }
    if (!inviteForm.roleId) { setInviteError("Role is required"); return; }
    if (!inviteForm.timezone) { setInviteError("Timezone is required"); return; }
    setInviting(true); setInviteError("");
    try {
      const country = tzToCountry[inviteForm.timezone] || "";
      await usersApi.create({
        email: inviteForm.email,
        name: inviteForm.name,
        password: inviteForm.password || undefined,
        country: country || undefined,
        language: inviteForm.language || undefined,
        timezone: inviteForm.timezone || undefined,
        roleId: inviteForm.roleId,
      });
      setShowInvite(false);
      setInviteForm({ email: "", name: "", password: "", language: "en", timezone: "", roleId: "" });
      setShowPassword(false);
      fetchData();
    } catch (err: unknown) {
      setInviteError(getErrorMessage(err, "Failed to create user"));
    } finally { setInviting(false); }
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await usersApi.update(editUser.id, {
        name: editName,
        roleId: editRoleId || undefined,
        language: editLanguage,
        timezone: editTimezone,
        country: tzToCountry[editTimezone] || undefined,
      });
      // If the edited user is the current user, refresh permissions
      if (editUser.id === userId) refreshPermissions();
      setEditUser(null);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update user"));
    }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await usersApi.delete(deleteId);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove user"));
    }
    setDeleteId(null);
  };

  const openEdit = async (u: UserItem) => {
    setEditUser(u);
    setEditRoleId(u.roleId || "");
    setEditName(u.name || "");
    try {
      const full = await usersApi.get(u.id);
      setEditLanguage(full.language || "en");
      setEditTimezone(full.timezone || "UTC");
    } catch {
      setEditLanguage("en");
      setEditTimezone("UTC");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Users</h2>
          <p className="text-sm text-text-muted mt-0.5">Manage team members and their roles.</p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
            Add User
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name or email…"
        />
        <button onClick={handleSearch} className="h-9 px-4 text-sm font-medium rounded-lg border border-border text-text-muted hover:bg-secondary-50 transition-colors">
          Search
        </button>
      </div>

      {/* Users table */}
      {loading ? (
        <PageLoading />
      ) : loadError ? (
        <PageError message={loadError} onRetry={fetchData} />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Joined</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-secondary-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-8  rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-semibold shrink-0">
                        {(u.name || u.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">{u.name || "—"}</p>
                        <p className="text-xs text-text-muted truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {u.roleName ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-600">{u.roleName}</span>
                      ) : (
                        <span className="text-xs text-text-muted">No role</span>
                      )}
                      {u.isOwner && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-600">Owner</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !u.isOwner && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} className="size-7  flex items-center justify-center rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors" aria-label="Edit role">
                          <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                        </button>
                        <button onClick={() => setDeleteId(u.id)} className="size-7  flex items-center justify-center rounded-md text-text-muted hover:text-danger-500 hover:bg-danger-500/10 transition-colors" aria-label="Remove user">
                          <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12 text-sm text-text-muted">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite User Modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Add User">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email <span className="text-danger-500">*</span></label>
            <input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="user@example.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Name <span className="text-danger-500">*</span></label>
            <input type="text" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="John Doe" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Password <span className="text-danger-500">*</span></label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={inviteForm.password}
                  onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                  className={inputCls}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors">
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                  )}
                </button>
              </div>
              <button type="button" onClick={generatePassword} className="h-11 px-3 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap">
                Generate
              </button>
            </div>
            {inviteForm.password && (
              <div className="mt-2 space-y-1">
                {([
                  [passwordChecks.length, "At least 8 characters"],
                  [passwordChecks.upper, "One uppercase letter"],
                  [passwordChecks.lower, "One lowercase letter"],
                  [passwordChecks.number, "One number"],
                  [passwordChecks.special, "One special character"],
                ] as [boolean, string][]).map(([ok, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`size-3.5  rounded-full flex items-center justify-center ${ok ? "bg-success-500" : "bg-secondary-200"}`}>
                      {ok && <svg className="size-2  text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                    </span>
                    <span className={`text-xs ${ok ? "text-success-600" : "text-text-muted"}`}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Role <span className="text-danger-500">*</span></label>
            <ComboBox
              value={inviteForm.roleId}
              onChange={v => setInviteForm(f => ({ ...f, roleId: v }))}
              options={roles.map(r => ({ value: r.id, label: r.name }))}
              placeholder="Select role…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Language <span className="text-danger-500">*</span></label>
            <ComboBox
              value={inviteForm.language}
              onChange={v => setInviteForm(f => ({ ...f, language: v }))}
              options={[["en","English"],["es","Spanish"],["it","Italian"]].map(([code, name]) => ({ value: code, label: name }))}
              placeholder="Select language…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Timezone <span className="text-danger-500">*</span></label>
            <ComboBox
              value={inviteForm.timezone}
              onChange={v => setInviteForm(f => ({ ...f, timezone: v }))}
              options={Object.keys(tzToCountry).filter(tz => tz !== "UTC").concat(["UTC"]).sort((a, b) => a.localeCompare(b)).map(tz => ({ value: tz, label: tz.replace(/_/g, " ") }))}
              placeholder="Select timezone…"
            />
            {inviteForm.timezone && tzToCountry[inviteForm.timezone] && (
              <p className="text-xs text-text-muted mt-1">Country: {tzToCountry[inviteForm.timezone]}</p>
            )}
          </div>
          {inviteError && <Alert variant="error">{inviteError}</Alert>}
          <div className="flex justify-end">
            <button type="submit" disabled={inviting || !inviteForm.roleId || !inviteForm.timezone || (!!inviteForm.password && !passwordValid)} className={`${btnPrimary} disabled:opacity-50`}>{inviting ? "Creating…" : "Add User"}</button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.name || "User"}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input type="text" value={editUser?.email || ""} readOnly className={`${inputCls} bg-secondary-50 text-text-muted cursor-default`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Name <span className="text-danger-500">*</span></label>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Role <span className="text-danger-500">*</span></label>
            <ComboBox
              value={editRoleId}
              onChange={v => setEditRoleId(v)}
              options={roles.map(r => ({ value: r.id, label: r.name }))}
              placeholder="Select role…"
            />
            {editRoleId && (() => {
              const role = roles.find(r => r.id === editRoleId);
              if (!role || !role.permissions.length) return null;
              return (
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.map(p => (
                    <span key={p} className="px-1.5 py-0.5 bg-secondary-50 text-text-muted rounded text-[10px]">{p}</span>
                  ))}
                </div>
              );
            })()}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Language <span className="text-danger-500">*</span></label>
            <ComboBox
              value={editLanguage}
              onChange={v => setEditLanguage(v)}
              options={[["en","English"],["es","Spanish"],["it","Italian"]].map(([code, name]) => ({ value: code, label: name }))}
              placeholder="Select language…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Timezone <span className="text-danger-500">*</span></label>
            <ComboBox
              value={editTimezone}
              onChange={v => setEditTimezone(v)}
              options={Object.keys(tzToCountry).filter(tz => tz !== "UTC").concat(["UTC"]).sort((a, b) => a.localeCompare(b)).map(tz => ({ value: tz, label: tz.replace(/_/g, " ") }))}
              placeholder="Select timezone…"
            />
            {editTimezone && tzToCountry[editTimezone] && (
              <p className="text-xs text-text-muted mt-1">Country: {tzToCountry[editTimezone]}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditUser(null)} className="h-9 px-4 text-sm font-medium rounded-lg border border-border text-text-muted hover:bg-secondary-50 transition-colors">Cancel</button>
            <button onClick={handleEditSave} disabled={saving || !editRoleId || !editTimezone} className={`${btnPrimary} disabled:opacity-50`}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} message="Are you sure you want to remove this user? This action cannot be undone." />
    </div>
  );
}
