import { useState, useEffect } from "react";
import { rolesApi } from "../../services/api";
import RoleFormModal from "../../components/RoleFormModal";
import ConfirmModal from "../../components/ConfirmModal";
import { btnPrimary } from "./shared";

export default function RolesTab() {
  const [roles, setRoles] = useState<Array<{ id: string; name: string; description: string; permissions: string[] }>>([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<{ id: string; name: string; description: string; permissions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await rolesApi.list(); setRoles(res.roles.filter((r: { name?: string }) => r && r.name)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const handleCreateRole = async (data: { name: string; description: string; permissions: string[] }) => {
    await rolesApi.create(data);
    setShowRoleModal(false); fetch_();
  };

  const handleEditRole = async (data: { name: string; description: string; permissions: string[] }) => {
    if (!editingRole) return;
    await rolesApi.update(editingRole.id, data);
    setEditingRole(null); fetch_();
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

      {/* Edit modal */}
      <RoleFormModal
        open={!!editingRole}
        onClose={() => setEditingRole(null)}
        onSubmit={handleEditRole}
        initialData={editingRole ? { name: editingRole.name, description: editingRole.description, permissions: editingRole.permissions || [] } : undefined}
        title="Edit Role"
        submitLabel="Save Changes"
      />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {roles.map((r) => (
            <div key={r.id} onClick={() => setEditingRole(r)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0 text-primary-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text truncate">{r.name}</p>
                  <p className="text-xs text-text-muted truncate">{r.description || "No description"}</p>
                </div>
              </div>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600">{r.permissions?.length || 0} permissions</span>
              {r.permissions?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.permissions.slice(0, 3).map((p: string) => (
                    <span key={p} className="px-1.5 py-0.5 bg-secondary-50 text-text-muted rounded text-[10px]">{formatPerm(p)}</span>
                  ))}
                  {r.permissions.length > 3 && <span className="px-1.5 py-0.5 text-text-muted text-[10px]">+{r.permissions.length - 3}</span>}
                </div>
              )}
            </div>
          ))}
          {roles.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No roles configured yet</p>}
        </div>
      )}
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingRole) rolesApi.delete(editingRole.id).then(fetch_); setEditingRole(null); setConfirmRemove(false); }} message="Are you sure you want to remove this role?" />
    </div>
  );
}
