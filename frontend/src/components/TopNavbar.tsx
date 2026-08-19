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
import { usePermissions } from "../context/PermissionsContext";
import RocketIcon from "./icons/outlined/RocketIcon";
import { FolderClosedIcon, LayoutGridIcon, LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, ShieldCheckIcon, SunMediumIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";

const navIcons: Partial<Record<NavIconName, ReactNode>> = {
  dashboard: <LayoutGridIcon className="size-4 shrink-0" />,
  projects: <FolderClosedIcon className="size-4 shrink-0" />,
  deploy: <RocketIcon className="size-4 shrink-0" />,
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
  const { logout, email, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { preference, setPreference } = useTheme();
  const { enabled: inAppEnabled } = useInAppNotificationsEnabled();
  const { has, loading: permLoading } = usePermissions();

  const visibleNavItems = sidebarNavItems.filter(
    (item) => !item.permission || (!permLoading && has(item.permission)),
  );

  const signOut = () => {
    logout();
    navigate("/login");
  };

  const displayName = userProfile?.name || email || "Account";
  const initials = userProfile?.name
    ? userProfile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : email
      ? email[0].toUpperCase()
      : "U";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/40 bg-card/30 backdrop-blur supports-backdrop-filter:bg-card/60">
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <AppBrand size="sm" className="shrink-0" />

        <nav
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide"
          aria-label="Main navigation"
        >
          {visibleNavItems.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              active={isNavItemActive(location.pathname, item)}
            />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {inAppEnabled && <NotificationDropdown />}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                aria-label="Profile menu"
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{displayName}</span>
                {email && userProfile?.name && (
                  <span className="text-xs font-normal text-muted-foreground">{email}</span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5 mx-1 my-1.5">
                <button
                  type="button"
                  onClick={() => setPreference("light")}
                  className={`flex flex-1 items-center justify-center rounded-sm py-1.5 transition-colors ${preference === "light" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label="Light theme"
                  aria-pressed={preference === "light"}
                >
                  <SunMediumIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreference("dark")}
                  className={`flex flex-1 items-center justify-center rounded-sm py-1.5 transition-colors ${preference === "dark" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label="Dark theme"
                  aria-pressed={preference === "dark"}
                >
                  <MoonIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreference("system")}
                  className={`flex flex-1 items-center justify-center rounded-sm py-1.5 transition-colors ${preference === "system" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label="System theme"
                  aria-pressed={preference === "system"}
                >
                  <MonitorIcon className="size-4" />
                </button>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}>
                <LogOutIcon />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
