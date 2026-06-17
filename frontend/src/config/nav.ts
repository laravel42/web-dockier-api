export type NavIconName =
  | "dashboard"
  | "projects"
  | "deploy"
  | "security"
  | "settings"
  | "notifications";

export interface NavItemConfig {
  to: string;
  label: string;
  shortLabel?: string;
  icon: NavIconName;
  /** Match pathname exactly (e.g. dashboard home) */
  exact?: boolean;
}

export interface NavGroupConfig {
  label?: string;
  items: NavItemConfig[];
}

export const sidebarNavGroups: NavGroupConfig[] = [
  {
    items: [{ to: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true }],
  },
  {
    label: "Workspace",
    items: [
      { to: "/projects", label: "Projects", icon: "projects" },
      { to: "/security", label: "Security", icon: "security" },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/settings", label: "Settings", icon: "settings" }],
  },
];

/** Flat sidebar list — admin-style single column */
export const sidebarNavItems: NavItemConfig[] = sidebarNavGroups.flatMap((g) => g.items);

export function isNavItemActive(pathname: string, item: NavItemConfig): boolean {
  if (item.exact) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
