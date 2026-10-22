import type { PermissionKey } from "./permissions";

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
  /** When set, nav item is hidden unless the user has this permission */
  permission?: PermissionKey;
}

/** Main nav items, in display order. Rendered by TopNavbar as a flat list. */
export const sidebarNavItems: NavItemConfig[] = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
  { to: "/projects", label: "Projects", icon: "projects" },
  { to: "/deploy", label: "Deploy", icon: "deploy", permission: "deploy:view" },
  { to: "/security", label: "Security", icon: "security", permission: "scan:view" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export function isNavItemActive(pathname: string, item: NavItemConfig): boolean {
  if (item.exact) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
