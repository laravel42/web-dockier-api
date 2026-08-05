import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import AppBrand from "./AppBrand";
import {
  type NavIconName,
  type NavItemConfig,
  sidebarNavItems,
  isNavItemActive,
} from "../config/nav";
import { useInAppNotificationsEnabled } from "../hooks/useInAppNotificationsEnabled";
import { navLinkActiveCls, navLinkCls, navLinkIdleCls } from "../utils/styles";
import NotificationDropdown from "./NotificationDropdown";
import { useTheme } from "../context/ThemeContext";
import { FolderClosedIcon, LayoutGridIcon, LogOutIcon, MoonIcon, SettingsIcon, ShieldCheckIcon, SunMediumIcon } from "lucide-react";

const navIcons: Partial<Record<NavIconName, ReactNode>> = {
  dashboard: <LayoutGridIcon className="size-4 shrink-0" />,
  projects: <FolderClosedIcon className="size-4 shrink-0" />,
  security: <ShieldCheckIcon className="size-4 shrink-0" />,
  settings: <SettingsIcon className="size-4 shrink-0" />,
};

function NavItem({ item, active }: { item: NavItemConfig; active: boolean }) {
  return (
    <Link
      to={item.to}
      className={`${navLinkCls} shrink-0 whitespace-nowrap ${active ? navLinkActiveCls : navLinkIdleCls}`}
      aria-current={active ? "page" : undefined}
    >
      {navIcons[item.icon]}
      <span>{item.label}</span>
    </Link>
  );
}

export default function TopNavbar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { enabled: inAppEnabled } = useInAppNotificationsEnabled();

  const signOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/40 bg-card/30 backdrop-blur supports-backdrop-filter:bg-card/60">
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <AppBrand size="sm" className="shrink-0" />

        <nav
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide"
          aria-label="Main navigation"
        >
          {sidebarNavItems.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              active={isNavItemActive(location.pathname, item)}
            />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "light" ? <MoonIcon className="size-4" /> : <SunMediumIcon className="size-4" />}
          </button>
          {inAppEnabled && <NotificationDropdown />}
          <button
            type="button"
            onClick={signOut}
            className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text transition-colors"
            aria-label="Sign out"
          >
            <LogOutIcon className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
