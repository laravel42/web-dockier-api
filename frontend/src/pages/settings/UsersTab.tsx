import { useState, useEffect, useCallback, useId } from "react";
import { usersApi, rolesApi } from "@/services/api";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import SettingsModalFooter from "@/components/SettingsModalFooter";
import { SettingsField, SettingsTextField } from "@/components/SettingsField";
import ComboBox from "@/components/ComboBox";
import { settingsBadgeCls, settingsCardCls, settingsCardGridCls, settingsCardInteractiveCls, typeCardDateCls } from "@/utils/styles";
import { Input } from "@/components/ui/input";
import Button from "@/components/ui/Button";
import { formatCardDateTime } from "@/utils/formatCardDate";
import PageLoading from "@/components/ui/PageLoading";
import PageError, { EmptyMessage } from "@/components/ui/PageError";
import Alert from "@/components/ui/Alert";
import { getErrorMessage } from "@/utils/errors";
import { useToast } from "@/context/useToast";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionsContext";
import { CheckIcon, ClipboardIcon, EyeIcon, EyeOffIcon, UserRoundPlusIcon } from "lucide-react";
import { clickableProps } from "@/utils/a11y";

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
  const fid = useId();
  const { userId } = useAuth();
  const toast = useToast();
  const { has, refresh: refreshPermissions } = usePermissions();
  const canManage = has("user:manage");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", password: "", language: "en", timezone: "", roleId: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordGenerated, setPasswordGenerated] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editRoleId, setEditRoleId] = useState("");
  const [editName, setEditName] = useState("");
  const [editLanguage, setEditLanguage] = useState("en");
  const [editTimezone, setEditTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [usersRes, rolesRes] = await Promise.all([
        usersApi.list(),
        rolesApi.list(),
      ]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
    setPasswordGenerated(true);
    setPasswordCopied(false);
  };

  const copyGeneratedPassword = async () => {
    if (!inviteForm.password) return;
    try {
      await navigator.clipboard.writeText(inviteForm.password);
      setPasswordCopied(true);
      window.setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
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
      setPasswordGenerated(false);
      setPasswordCopied(false);
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
    if (!editUser) return;
    try {
      await usersApi.delete(editUser.id);
      setEditUser(null);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove user"));
    }
    setConfirmDelete(false);
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
          <Button onClick={() => setShowInvite(true)} iconLeft={<UserRoundPlusIcon className="size-4" />}>
            Add User
          </Button>
        )}
      </div>

      {loading ? (
        <PageLoading />
      ) : loadError ? (
        <PageError message={loadError} onRetry={fetchData} />
      ) : (
        <div className={settingsCardGridCls}>
          {users.map((u) => {
            const editable = canManage && !u.isOwner;
            return (
              <div
                key={u.id}
                {...clickableProps(() => openEdit(u), editable)}
                className={editable ? settingsCardInteractiveCls : settingsCardCls}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="size-9 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-semibold shrink-0">
                    {(u.name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{u.name || "—"}</p>
                    <p className="text-xs text-text-muted truncate">{u.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    {u.roleName ? (
                      <span className={settingsBadgeCls.primary}>{u.roleName}</span>
                    ) : (
                      <span className="text-xs text-text-muted">No role</span>
                    )}
                    {u.isOwner && (
                      <span className={settingsBadgeCls.warning}>Owner</span>
                    )}
                  </div>
                  <span className={`${typeCardDateCls} text-xs text-text-muted text-right`}>
                    Joined {formatCardDateTime(u.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="col-span-full">
              <EmptyMessage>No users yet</EmptyMessage>
            </div>
          )}
        </div>
      )}

      {/* Invite User Modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Add User">
        <form onSubmit={handleInvite} className="space-y-4">
          <SettingsTextField id="invite-email" label="Email" requiredMark required type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
          <SettingsTextField id="invite-name" label="Name" requiredMark required type="text" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5" htmlFor={`${fid}-password`}>Password <span className="text-danger-500">*</span></label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input id={`${fid}-password`}
                  type={showPassword ? "text" : "password"}
                  value={inviteForm.password}
                  onChange={(e) => {
                    setPasswordGenerated(false);
                    setPasswordCopied(false);
                    setInviteForm(f => ({ ...f, password: e.target.value }));
                  }}
                  className={inviteForm.password ? (passwordGenerated ? "pr-16" : "pr-9") : ""}
                  placeholder="••••••••"
                />
                {passwordGenerated && inviteForm.password && (
                  <button
                    type="button"
                    onClick={() => void copyGeneratedPassword()}
                    className="absolute right-9 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                    aria-label="Copy password"
                  >
                    {passwordCopied ? (
                      <CheckIcon className="size-4 text-primary-500" />
                    ) : (
                      <ClipboardIcon className="size-4" />
                    )}
                  </button>
                )}
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors">
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
              <button type="button" onClick={generatePassword} className="h-9 shrink-0 px-3 text-xs font-medium rounded-md bg-warning-500 text-primary-foreground hover:bg-warning-500/90 transition-colors whitespace-nowrap">
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
                      {ok && <CheckIcon className="size-2 text-white" />}
                    </span>
                    <span className={`text-xs ${ok ? "text-success-600" : "text-text-muted"}`}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <SettingsField label="Role" requiredMark>
            <ComboBox
              value={inviteForm.roleId}
              onChange={v => setInviteForm(f => ({ ...f, roleId: v }))}
              options={roles.map(r => ({ value: r.id, label: r.name }))}
              placeholder="Select role…"
            />
          </SettingsField>
          <SettingsField label="Language" requiredMark>
            <ComboBox
              value={inviteForm.language}
              onChange={v => setInviteForm(f => ({ ...f, language: v }))}
              options={[["en","English"],["es","Spanish"],["it","Italian"]].map(([code, name]) => ({ value: code, label: name }))}
              placeholder="Select language…"
            />
          </SettingsField>
          <SettingsField label="Timezone" requiredMark>
            <ComboBox
              value={inviteForm.timezone}
              onChange={v => setInviteForm(f => ({ ...f, timezone: v }))}
              options={Object.keys(tzToCountry).filter(tz => tz !== "UTC").concat(["UTC"]).sort((a, b) => a.localeCompare(b)).map(tz => ({ value: tz, label: tz.replace(/_/g, " ") }))}
              placeholder="Select timezone…"
            />
          </SettingsField>
          {inviteError && <Alert variant="error">{inviteError}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" disabled={inviting || !inviteForm.roleId || !inviteForm.timezone || (!!inviteForm.password && !passwordValid)} loading={inviting}>{inviting ? "Creating…" : "Add User"}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.name || "User"}`}>
        <div className="space-y-4">
          <SettingsTextField id="edit-email" label="Email" type="text" value={editUser?.email || ""} readOnly className="bg-secondary-50 text-text-muted cursor-default" />
          <SettingsTextField id="edit-name" label="Name" requiredMark type="text" value={editName} onChange={e => setEditName(e.target.value)} />
          <SettingsField label="Role" requiredMark>
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
                    <span key={p} className="px-1.5 py-0.5 bg-secondary-50 text-text-muted rounded text-xs">{p}</span>
                  ))}
                </div>
              );
            })()}
          </SettingsField>
          <SettingsField label="Language" requiredMark>
            <ComboBox
              value={editLanguage}
              onChange={v => setEditLanguage(v)}
              options={[["en","English"],["es","Spanish"],["it","Italian"]].map(([code, name]) => ({ value: code, label: name }))}
              placeholder="Select language…"
            />
          </SettingsField>
          <SettingsField label="Timezone" requiredMark>
            <ComboBox
              value={editTimezone}
              onChange={v => setEditTimezone(v)}
              options={Object.keys(tzToCountry).filter(tz => tz !== "UTC").concat(["UTC"]).sort((a, b) => a.localeCompare(b)).map(tz => ({ value: tz, label: tz.replace(/_/g, " ") }))}
              placeholder="Select timezone…"
            />
          </SettingsField>
          <SettingsModalFooter
            onDelete={editUser && canManage && !editUser.isOwner ? () => setConfirmDelete(true) : undefined}
            deleteAriaLabel={`Remove ${editUser?.name || editUser?.email || "user"}`}
          >            
            <Button onClick={handleEditSave} disabled={saving || !editRoleId || !editTimezone} loading={saving}>{saving ? "Saving…" : "Save"}</Button>
          </SettingsModalFooter>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        message="Are you sure you want to remove this user? This action cannot be undone."
      />
    </div>
  );
}
