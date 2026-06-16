import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";
import AppBrand from "./AppBrand";
import {
  type NavIconName,
  type NavItemConfig,
  sidebarNavItems,
  isNavItemActive,
  navItemsForInAppState,
} from "../config/nav";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import { useInAppNotificationsEnabled } from "../hooks/useInAppNotificationsEnabled";
import { navLinkActiveCls, navLinkCls, navLinkIdleCls } from "../utils/styles";
import DashboardIcon from "./icons/outlined/DashboardIcon";
import FolderIcon from "./icons/outlined/FolderIcon";
import UploadIcon from "./icons/outlined/UploadIcon";
import ShieldCheckIcon from "./icons/outlined/ShieldCheckIcon";
import SettingsIcon from "./icons/outlined/SettingsIcon";
import BellIcon from "./icons/outlined/BellIcon";
import LogoutIcon from "./icons/outlined/LogoutIcon";

const navIcons: Record<NavIconName, ReactNode> = {
  dashboard: <DashboardIcon className="size-4 shrink-0" />,
  projects: <FolderIcon className="size-4 shrink-0" />,
  deploy: <UploadIcon className="size-4 shrink-0" />,
  security: <ShieldCheckIcon className="size-4 shrink-0" />,
  settings: <SettingsIcon className="size-4 shrink-0" />,
  notifications: <BellIcon className="size-4 shrink-0" />,
};

function NavItem({
  item,
  active,
  badge,
}: {
  item: NavItemConfig;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={item.to}
      className={`${navLinkCls} ${active ? navLinkActiveCls : navLinkIdleCls}`}
      aria-current={active ? "page" : undefined}
    >
      {navIcons[item.icon]}
      <span className="flex-1 truncate">{item.label}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-xs font-semibold tabular-nums flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const unreadCount = useUnreadNotificationCount();
  const { enabled: inAppEnabled } = useInAppNotificationsEnabled();
  const navItems = navItemsForInAppState(sidebarNavItems, inAppEnabled);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/40 bg-card/30 px-3 py-5 lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen">
      <AppBrand />

      <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            item={item}
            active={isNavItemActive(location.pathname, item)}
            badge={item.icon === "notifications" ? unreadCount : undefined}
          />
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-3 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-ui text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <LogoutIcon className="size-4" />
        Sign out
      </button>
    </aside>
  );
}
