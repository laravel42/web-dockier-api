import { useState } from "react";
import { rolesApi } from "../../services/api";
import RoleFormModal from "../../components/RoleFormModal";
import ConfirmModal from "../../components/ConfirmModal";
import { btnPrimary, settingsCardCls, settingsCardGridCls, settingsCardInteractiveCls } from "../../utils/styles";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import { useTabList } from "../../hooks/useTabList";
import { usePermissions } from "../../context/PermissionsContext";
import { useToast } from "../../context/useToast";
import { getErrorMessage } from "../../utils/errors";

function isAdminRole(role: RoleItem | null): boolean {
  if (!role) return false;
  return role.systemKey === "admin" || role.name.trim().toLowerCase() === "admin";
}

function isRoleDeletable(role: RoleItem | null): boolean {
  return !!role && !isAdminRole(role);
}

type RoleItem = {
  id: string;
  name: string;
  description: string;
  systemKey: string | null;
  isSystem: boolean;
  isEditable: boolean;
  isDeletable: boolean;
  permissions: string[];
};

export default function RolesTab() {
  const { has, roleId: currentRoleId, refresh: refreshPermissions } = usePermissions();
  const canManage = has("role:manage");
  const toast = useToast();
  const { data: roles, loading, error, reload } = useTabList(
    () => rolesApi.list().then((res) => res.roles.filter((r) => r && r.name) as RoleItem[]),
    [],
  );
  const roleList = roles ?? [];
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleCreateRole = async (data: { name: string; description: string; permissions: string[] }) => {
    await rolesApi.create(data);
    setShowRoleModal(false);
    reload();
  };

  const handleEditRole = async (data: { name: string; description: string; permissions: string[] }) => {
    if (!editingRole) return;
    await rolesApi.update(editingRole.id, data);
    setEditingRole(null);
    reload();
    if (editingRole.id === currentRoleId) refreshPermissions();
  };

  const handleDeleteRole = async () => {
    if (!editingRole || !isRoleDeletable(editingRole)) return;
    try {
      await rolesApi.delete(editingRole.id);
      setEditingRole(null);
      setConfirmRemove(false);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove role"));
      setConfirmRemove(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Roles</h2>
          <p className="text-sm text-text-muted mt-0.5">Define roles and permissions for your team.</p>
        </div>
        {canManage && (
          <button onClick={() => setShowRoleModal(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Role
          </button>
        )}
      </div>

      <RoleFormModal open={showRoleModal} onClose={() => setShowRoleModal(false)} onSubmit={handleCreateRole} />

      <RoleFormModal
        open={!!editingRole}
        onClose={() => setEditingRole(null)}
        onSubmit={handleEditRole}
        initialData={editingRole ? { name: editingRole.name, description: editingRole.description, permissions: editingRole.permissions || [] } : undefined}
        title="Edit Role"
        submitLabel="Save Changes"
        onDelete={isRoleDeletable(editingRole) && canManage ? () => setConfirmRemove(true) : undefined}
        deleteAriaLabel={`Remove ${editingRole?.name || "role"}`}
      />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : (
        <div className={settingsCardGridCls}>
          {roleList.map((r) => (
            <div
              key={r.id}
              onClick={() => r.isEditable && canManage ? setEditingRole(r) : undefined}
              className={`${r.isEditable && canManage ? settingsCardInteractiveCls : settingsCardCls}${r.isEditable && canManage ? "" : " opacity-75"}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="size-8  flex items-center justify-center shrink-0 text-primary-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-6 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-text truncate">{r.name}</p>
                    {r.isSystem && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-secondary-100 text-text-muted shrink-0">System</span>}
                  </div>
                  <p className="text-xs text-text-muted truncate">{r.description || "No description"}</p>
                </div>
              </div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600">{r.permissions?.length || 0} permissions</span>
            </div>
          ))}
          {roleList.length === 0 && (
            <div className="col-span-full">
              <EmptyMessage>No roles configured yet</EmptyMessage>
            </div>
          )}
        </div>
      )}
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={handleDeleteRole} message="Are you sure you want to remove this role?" />
    </div>
  );
}
