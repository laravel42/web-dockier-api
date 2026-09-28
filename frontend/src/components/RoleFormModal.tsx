import { useState, useMemo } from "react";
import Modal from "./Modal";
import SettingsModalFooter from "./SettingsModalFooter";
import Button from "./ui/Button";
import { Input } from "./ui/input";
import { SearchIcon, CheckIcon, MinusIcon, ChevronDownIcon, LockIcon } from "lucide-react";
import {
  PERMISSION_SECTIONS,
  ASSIGNABLE_PERMISSION_KEYS,
  BASELINE_PERMISSION_KEYS,
  type PermissionGroup,
  type PermissionSection,
} from "../config/permissions";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; permissions: string[] }) => void;
  initialData?: { name: string; description: string; permissions: string[] };
  title?: string;
  submitLabel?: string;
  onDelete?: () => void;
  deleteAriaLabel?: string;
}

export default function RoleFormModal({ open, onClose, onSubmit, initialData, title, submitLabel, onDelete, deleteAriaLabel }: Props) {
  const [mountKey, setMountKey] = useState(0);

  return (
    <Modal open={open} onClose={onClose} title={title || "New role"} size="lg" bodyScroll={false}>
      {open && (
        <RoleFormInner
          key={mountKey}
          onSubmit={(data) => { onSubmit(data); setMountKey(k => k + 1); }}
          initialData={initialData}
          submitLabel={submitLabel}
          onDelete={onDelete}
          deleteAriaLabel={deleteAriaLabel}
        />
      )}
    </Modal>
  );
}

function RoleFormInner({ onSubmit, initialData, submitLabel, onDelete, deleteAriaLabel }: { onSubmit: Props["onSubmit"]; initialData?: Props["initialData"]; submitLabel?: string; onDelete?: () => void; deleteAriaLabel?: string }) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialData?.permissions?.length ? initialData.permissions : BASELINE_PERMISSION_KEYS)
  );
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /**
   * Permissions the role already holds that this editor does not render
   * (e.g. legacy `team:*` grants). Preserved verbatim on save so an unrelated
   * edit never silently strips them.
   */
  const unmanaged = useMemo(
    () => (initialData?.permissions ?? []).filter((p) => !ASSIGNABLE_PERMISSION_KEYS.includes(p)),
    [initialData],
  );

  const toggle = (key: string, locked?: boolean) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(ASSIGNABLE_PERMISSION_KEYS));

  const deselectAll = () => setSelected(new Set(BASELINE_PERMISSION_KEYS));

  /** Toggle every unlocked permission in a group on or off together. */
  const toggleGroupSelection = (group: PermissionGroup) => {
    const unlocked = group.permissions.filter((p) => !p.locked).map((p) => p.key);
    if (unlocked.length === 0) return;
    const allOn = unlocked.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of unlocked) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const toggleCollapse = (group: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filteredSections = useMemo<PermissionSection[]>(() => {
    if (!search.trim()) return PERMISSION_SECTIONS;
    const q = search.toLowerCase();
    return PERMISSION_SECTIONS.map((section) => ({
      ...section,
      groups: section.groups
        .map((g) => ({
          ...g,
          permissions: g.permissions.filter(
            (p) => p.key.toLowerCase().includes(q) || p.label.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.permissions.length > 0),
    })).filter((section) => section.groups.length > 0);
  }, [search]);

  const hasResults = filteredSections.length > 0;

  const getGroupCheckState = (group: PermissionGroup) => {
    const keys = group.permissions.map((p) => p.key);
    const checkedCount = keys.filter((k) => selected.has(k)).length;
    if (checkedCount === 0) return "none";
    if (checkedCount === keys.length) return "all";
    return "partial";
  };

  const selectedCount = useMemo(
    () => ASSIGNABLE_PERMISSION_KEYS.filter((k) => selected.has(k)).length,
    [selected],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const permissions = Array.from(new Set([...selected, ...BASELINE_PERMISSION_KEYS, ...unmanaged]));
    onSubmit({ name, description, permissions });
  };

  return (
      <div className="flex h-full min-h-0 flex-col gap-4">
      <form id="role-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
        <div className="shrink-0 space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="role-name" className="mb-0.5 block text-sm font-semibold text-foreground">
            Name
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">The name of the role.</p>
          <Input
            id="role-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="role-desc" className="mb-0.5 block text-sm font-semibold text-foreground">
            Description <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">Optional</span>
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">An optional, informational description of the role.</p>
          <Input
            id="role-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        </div>

        {/* Permissions */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Permissions</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {selectedCount} of {ASSIGNABLE_PERMISSION_KEYS.length} selected
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permissions"
              aria-label="Search permissions"
              className="pl-9"
            />
          </div>

          {/* Sections → groups → permissions */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-(--radius-input) border border-border">
            {filteredSections.map((section) => (
              <div key={section.name} className="border-b border-border last:border-b-0">
                <div className="bg-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{section.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
                </div>

                {section.groups.map((group) => {
                  const checkState = getGroupCheckState(group);
                  const isCollapsed = collapsed.has(group.name);

                  return (
                    <div key={group.name} className="border-t border-border">
                      {/* Group header: checkbox toggles the group, the rest collapses it */}
                      <div className="flex w-full items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50">
                        <span
                          role="checkbox"
                          aria-checked={checkState === "all" ? true : checkState === "none" ? false : "mixed"}
                          aria-label={`All ${group.name} permissions`}
                          tabIndex={0}
                          onClick={() => toggleGroupSelection(group)}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggleGroupSelection(group);
                            }
                          }}
                          className={`flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded border transition-colors ${
                            checkState === "all" || checkState === "partial"
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background"
                          }`}
                        >
                          {checkState === "all" && (
                            <CheckIcon className="size-3" />
                          )}
                          {checkState === "partial" && (
                            <MinusIcon className="size-3" />
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCollapse(group.name)}
                          aria-expanded={!isCollapsed}
                          className="flex flex-1 items-center gap-2 text-left"
                        >
                          <span className="flex-1 text-sm font-semibold text-foreground">{group.name}</span>
                          <ChevronDownIcon
                            className={`size-4 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                          />
                        </button>
                      </div>

                      {/* Permission items */}
                      {!isCollapsed && (
                        <div>
                          {group.permissions.map((perm) => (
                            <div
                              key={perm.key}
                              className={`flex items-start gap-2.5 px-3 py-2 pl-5 transition-colors hover:bg-muted/50 ${
                                perm.locked ? "cursor-default" : "cursor-pointer"
                              }`}
                            >
                              <span
                                role="checkbox"
                                aria-checked={selected.has(perm.key)}
                                aria-disabled={perm.locked || undefined}
                                aria-label={perm.label}
                                tabIndex={perm.locked ? -1 : 0}
                                onClick={(e) => { e.preventDefault(); toggle(perm.key, perm.locked); }}
                                onKeyDown={(e) => {
                                  if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    toggle(perm.key, perm.locked);
                                  }
                                }}
                                className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                                  selected.has(perm.key)
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background"
                                } ${perm.locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                              >
                                {selected.has(perm.key) && (
                                  <CheckIcon className="size-3" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-foreground">{perm.label}</span>
                                  {perm.locked && (
                                    <LockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Always granted" />
                                  )}
                                </div>
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{perm.key}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {!hasResults && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No permissions found</div>
            )}
          </div>

          {/* Select / Deselect all */}
          <div className="mt-2 flex shrink-0 gap-3">
            <button type="button" onClick={selectAll} className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
              Select all permissions
            </button>
            <button type="button" onClick={deselectAll} className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
              Deselect all permissions
            </button>
          </div>
        </div>
      </form>

      <SettingsModalFooter onDelete={onDelete} deleteAriaLabel={deleteAriaLabel}>
        <Button
          type="submit"
          form="role-form"
          disabled={!name.trim()}
        >
          {submitLabel || "Create role"}
        </Button>
      </SettingsModalFooter>
      </div>
  );
}
