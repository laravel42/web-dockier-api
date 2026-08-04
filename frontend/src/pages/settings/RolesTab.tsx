import { useState } from "react";
import { rolesApi } from "../../services/api";
import RoleFormModal from "../../components/RoleFormModal";
import ConfirmModal from "../../components/ConfirmModal";
import { settingsBadgeCls, settingsCardCls, settingsCardGridCls, settingsCardInteractiveCls } from "../../utils/styles";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import { useAsyncData } from "../../hooks/useAsyncData";
import { usePermissions } from "../../context/PermissionsContext";
import { useToast } from "../../context/useToast";
import { getErrorMessage } from "../../utils/errors";
import PlusIcon from "@/components/icons/outlined/PlusIcon";
import ShieldCheckIcon from "../../components/icons/outlined/ShieldCheckIcon";
import Button from "@/components/ui/Button";

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
  const { data: roles, loading, error, reload } = useAsyncData(
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
          <Button onClick={() => setShowRoleModal(true)} iconLeft={<PlusIcon />}>
            Add Role
          </Button>
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
                  <ShieldCheckIcon className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-text truncate">{r.name}</p>
                    {r.isSystem && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-secondary-100 text-text-muted shrink-0">System</span>}
                  </div>
                  <p className="text-xs text-text-muted truncate">{r.description || "No description"}</p>
                </div>
              </div>
              <span className={settingsBadgeCls.primary}>
                {r.permissions?.length || 0} permissions
              </span>
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
