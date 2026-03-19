import { useState, useMemo } from "react";
import Modal from "./Modal";

interface Permission {
  key: string;
  label: string;
  locked?: boolean;
}

interface PermissionGroup {
  name: string;
  permissions: Permission[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    name: "Organization",
    permissions: [
      { key: "organization:manage", label: "Allow members to manage the organization" },
      { key: "organization:delete", label: "Allow members to delete the organization" },
      { key: "organization:view", label: "Allow members to view the organization", locked: true },
    ],
  },
  {
    name: "Credential",
    permissions: [
      { key: "credential:view", label: "Allow members to view credentials", locked: true },
      { key: "credential:manage", label: "Allow members to manage credentials" },
    ],
  },
  {
    name: "Team",
    permissions: [
      { key: "team:view", label: "Allow members to view teams", locked: true },
      { key: "team:create", label: "Allow members to create teams" },
      { key: "team:delete", label: "Allow members to delete teams and team members" },
    ],
  },
  {
    name: "Project",
    permissions: [
      { key: "project:view", label: "Allow members to view projects" },
      { key: "project:create", label: "Allow members to create projects" },
      { key: "project:manage", label: "Allow members to manage projects" },
      { key: "project:delete", label: "Allow members to delete projects" },
    ],
  },
  {
    name: "Deploy",
    permissions: [
      { key: "deploy:view", label: "Allow members to view deployments" },
      { key: "deploy:create", label: "Allow members to create deployments" },
      { key: "deploy:manage", label: "Allow members to manage deployments" },
    ],
  },
  {
    name: "Notification",
    permissions: [
      { key: "notification:view", label: "Allow members to view notifications" },
      { key: "notification:manage", label: "Allow members to manage notification channels" },
      { key: "notification:send", label: "Allow members to send notifications" },
    ],
  },
  {
    name: "User",
    permissions: [
      { key: "user:view", label: "Allow members to view users" },
      { key: "user:manage", label: "Allow members to manage users" },
      { key: "user:delete", label: "Allow members to delete users" },
    ],
  },
  {
    name: "Billing",
    permissions: [
      { key: "billing:view", label: "Allow members to view billing" },
      { key: "billing:manage", label: "Allow members to manage billing" },
    ],
  },
];

const ALL_LOCKED = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.filter((p) => p.locked).map((p) => p.key)
);

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; permissions: string[] }) => void;
}

export default function RoleFormModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_LOCKED));
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const inputCls =
    "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";

  const toggle = (key: string, locked?: boolean) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));
    setSelected(all);
  };

  const deselectAll = () => {
    setSelected(new Set(ALL_LOCKED));
  };

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return PERMISSION_GROUPS;
    const q = search.toLowerCase();
    return PERMISSION_GROUPS.map((g) => ({
      ...g,
      permissions: g.permissions.filter(
        (p) => p.key.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)
      ),
    })).filter((g) => g.permissions.length > 0);
  }, [search]);

  const getGroupCheckState = (group: PermissionGroup) => {
    const keys = group.permissions.map((p) => p.key);
    const checkedCount = keys.filter((k) => selected.has(k)).length;
    if (checkedCount === 0) return "none";
    if (checkedCount === keys.length) return "all";
    return "partial";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, permissions: Array.from(selected) });
    setName("");
    setDescription("");
    setSelected(new Set(ALL_LOCKED));
    setSearch("");
    setCollapsed(new Set());
  };

  const handleClose = () => {
    onClose();
    setName("");
    setDescription("");
    setSelected(new Set(ALL_LOCKED));
    setSearch("");
    setCollapsed(new Set());
  };

  return (
    <Modal open={open} onClose={handleClose} title="New role">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="role-name" className="block text-sm font-semibold text-text mb-0.5">
            Name
          </label>
          <p className="text-xs text-text-muted mb-1.5">The name of the role.</p>
          <input
            id="role-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="role-desc" className="block text-sm font-semibold text-text mb-0.5">
            Description <span className="text-xs font-normal text-text-muted border border-border rounded px-1.5 py-0.5 ml-1">Optional</span>
          </label>
          <p className="text-xs text-text-muted mb-1.5">An optional, informational description of the role.</p>
          <input
            id="role-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Permissions */}
        <div>
          <p className="text-sm font-semibold text-text mb-2">Permissions</p>

          {/* Search */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full h-9 pl-9 pr-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors"
            />
          </div>

          {/* Permission groups */}
          <div className="border border-border rounded-[var(--radius-input)] max-h-72 overflow-y-auto">
            {filteredGroups.map((group) => {
              const checkState = getGroupCheckState(group);
              const isCollapsed = collapsed.has(group.name);

              return (
                <div key={group.name} className="border-b border-border last:border-b-0">
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.name)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary-50 transition-colors"
                  >
                    {/* Group checkbox indicator */}
                    <span
                      className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        checkState === "all"
                          ? "bg-primary-500 border-primary-500"
                          : checkState === "partial"
                          ? "bg-primary-500 border-primary-500"
                          : "border-border"
                      }`}
                    >
                      {checkState === "all" && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                      {checkState === "partial" && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-text flex-1 text-left">{group.name}</span>
                    <svg
                      className={`w-4 h-4 text-text-muted transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {/* Permission items */}
                  {!isCollapsed && (
                    <div>
                      {group.permissions.map((perm) => (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-3 px-3 py-2.5 pl-6 cursor-pointer hover:bg-secondary-50 transition-colors ${
                            perm.locked ? "opacity-80" : ""
                          }`}
                        >
                          <span
                            onClick={(e) => { e.preventDefault(); toggle(perm.key, perm.locked); }}
                            className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                              selected.has(perm.key)
                                ? "bg-primary-500 border-primary-500"
                                : "border-border"
                            } ${perm.locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            {selected.has(perm.key) && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-text">{perm.key}</span>
                              {perm.locked && (
                                <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                              )}
                            </div>
                            <p className="text-xs text-text-muted mt-0.5">{perm.label}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredGroups.length === 0 && (
              <div className="px-3 py-6 text-sm text-text-muted text-center">No permissions found</div>
            )}
          </div>

          {/* Select / Deselect all */}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={selectAll} className="text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors">
              Select all permissions
            </button>
            <button type="button" onClick={deselectAll} className="text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors">
              Deselect all permissions
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-9 px-5 bg-text text-card text-sm font-medium rounded-[var(--radius-btn)] hover:bg-text/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create role
          </button>
        </div>
      </form>
    </Modal>
  );
}
