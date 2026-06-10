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
    name: "Security Scans",
    permissions: [
      { key: "scan:view", label: "Allow members to view security scan results" },
      { key: "scan:run", label: "Allow members to run security scans" },
      { key: "scan:manage", label: "Allow members to manage scan settings and rules" },
      { key: "scan:create_issue", label: "Allow members to create issues from findings" },
      { key: "scan:create_mr", label: "Allow members to create fix merge requests from findings" },
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
    name: "Roles",
    permissions: [
      { key: "role:view", label: "Allow members to view roles and permissions", locked: true },
      { key: "role:manage", label: "Allow members to create, edit, and delete roles" },
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
  initialData?: { name: string; description: string; permissions: string[] };
  title?: string;
  submitLabel?: string;
}

export default function RoleFormModal({ open, onClose, onSubmit, initialData, title, submitLabel }: Props) {
  const [mountKey, setMountKey] = useState(0);

  return (
    <Modal open={open} onClose={onClose} title={title || "New role"} size="lg">
      {open && <RoleFormInner key={mountKey} onSubmit={(data) => { onSubmit(data); setMountKey(k => k + 1); }} initialData={initialData} submitLabel={submitLabel} />}
    </Modal>
  );
}

function RoleFormInner({ onSubmit, initialData, submitLabel }: { onSubmit: Props["onSubmit"]; initialData?: Props["initialData"]; submitLabel?: string }) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialData?.permissions?.length ? initialData.permissions : ALL_LOCKED)
  );
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const inputCls =
    "h-10 w-full rounded-(--radius-input) border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20";

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
  };

  return (
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="role-name" className="mb-0.5 block text-sm font-semibold text-foreground">
            Name
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">The name of the role.</p>
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
          <label htmlFor="role-desc" className="mb-0.5 block text-sm font-semibold text-foreground">
            Description <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">Optional</span>
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">An optional, informational description of the role.</p>
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
          <p className="mb-2 text-sm font-semibold text-foreground">Permissions</p>

          {/* Search */}
          <div className="relative mb-3">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-(--radius-input) border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Permission groups */}
          <div className="max-h-80 overflow-y-auto rounded-(--radius-input) border border-border">
            {filteredGroups.map((group) => {
              const checkState = getGroupCheckState(group);
              const isCollapsed = collapsed.has(group.name);

              return (
                <div key={group.name} className="border-b border-border last:border-b-0">
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.name)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    {/* Group checkbox indicator */}
                    <span
                      className={`flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                        checkState === "all" || checkState === "partial"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      }`}
                    >
                      {checkState === "all" && (
                        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                      {checkState === "partial" && (
                        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-left text-sm font-semibold text-foreground">{group.name}</span>
                    <svg
                      className={`size-4 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-180"}`}
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
                          className={`flex items-start gap-2.5 px-3 py-2 pl-5 transition-colors hover:bg-muted/50 ${
                            perm.locked ? "cursor-default" : "cursor-pointer"
                          }`}
                        >
                          <span
                            onClick={(e) => { e.preventDefault(); toggle(perm.key, perm.locked); }}
                            className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                              selected.has(perm.key)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            } ${perm.locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                          >
                            {selected.has(perm.key) && (
                              <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-medium ${perm.locked ? "text-muted-foreground" : "text-foreground"}`}>
                                {perm.key}
                              </span>
                              {perm.locked && (
                                <svg className="size-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{perm.label}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredGroups.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No permissions found</div>
            )}
          </div>

          {/* Select / Deselect all */}
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={selectAll} className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
              Select all permissions
            </button>
            <button type="button" onClick={deselectAll} className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
              Deselect all permissions
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-9 px-5 bg-text text-card text-sm font-medium rounded-(--radius-btn) hover:bg-text/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitLabel || "Create role"}
          </button>
        </div>
      </form>
  );
}
