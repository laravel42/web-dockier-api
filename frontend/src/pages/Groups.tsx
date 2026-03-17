import { useState, useEffect } from "react";
import { groupsApi, rolesApi } from "../services/api";

export default function Groups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [tab, setTab] = useState<"groups" | "roles">("groups");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", permissions: "" });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([groupsApi.list(), rolesApi.list()]);
      setGroups(g.groups); setRoles(r.roles);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await groupsApi.create({ name: formData.name, description: formData.description });
    setShowForm(false); setFormData({ name: "", description: "", permissions: "" }); fetchData();
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    await rolesApi.create({ name: formData.name, description: formData.description, permissions: formData.permissions.split(",").map((p) => p.trim()) });
    setShowForm(false); setFormData({ name: "", description: "", permissions: "" }); fetchData();
  };

  const inputCls = "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";
  const tabCls = (active: boolean) => `h-9 px-4 text-sm font-medium rounded-[var(--radius-btn)] transition-colors ${active ? "bg-primary-500 text-white" : "text-text-secondary hover:bg-secondary-50"}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text">Groups & Roles</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors">
          {showForm ? "Cancel" : `New ${tab === "groups" ? "Group" : "Role"}`}
        </button>
      </div>

      <div className="flex gap-2 mb-6" role="tablist">
        <button role="tab" aria-selected={tab === "groups"} onClick={() => { setTab("groups"); setShowForm(false); }} className={tabCls(tab === "groups")}>Groups ({groups.length})</button>
        <button role="tab" aria-selected={tab === "roles"} onClick={() => { setTab("roles"); setShowForm(false); }} className={tabCls(tab === "roles")}>Roles ({roles.length})</button>
      </div>

      {showForm && (
        <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 mb-6">
          <form onSubmit={tab === "groups" ? handleCreateGroup : handleCreateRole} className="space-y-4">
            <div>
              <label htmlFor="item-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
              <input id="item-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
            </div>
            <div>
              <label htmlFor="item-desc" className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
              <input id="item-desc" type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className={inputCls} />
            </div>
            {tab === "roles" && (
              <div>
                <label htmlFor="item-perms" className="block text-sm font-medium text-text-secondary mb-1.5">Permissions (comma-separated)</label>
                <input id="item-perms" type="text" value={formData.permissions} onChange={(e) => setFormData({ ...formData, permissions: e.target.value })} className={inputCls} placeholder="read, write, delete" />
              </div>
            )}
            <button type="submit" className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors">Create</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === "groups" ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-text">{g.name}</h3>
                <p className="text-sm text-text-secondary mt-0.5">{g.description}</p>
              </div>
              <button onClick={() => groupsApi.delete(g.id).then(fetchData)} className="text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors">Delete</button>
            </div>
          ))}
          {groups.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No groups yet</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-text">{r.name}</h3>
                <p className="text-sm text-text-secondary mt-0.5">{r.description}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {r.permissions.map((p: string) => (
                    <span key={p} className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded-md text-xs font-medium">{p}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => rolesApi.delete(r.id).then(fetchData)} className="text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors">Delete</button>
            </div>
          ))}
          {roles.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No roles yet</p>}
        </div>
      )}
    </div>
  );
}
