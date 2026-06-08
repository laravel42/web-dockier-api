import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import ErrorBoundary from "./ErrorBoundary";
import AppBrand from "./AppBrand";
import { useAuth } from "../context/AuthContext";
import { mobileNavItems, isNavItemActive } from "../config/nav";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import LogoutIcon from "./icons/outlined/LogoutIcon";
import NotificationDropdown from "./NotificationDropdown";
import { useTheme } from "../context/ThemeContext";
import MoonIcon from "./icons/outlined/MoonIcon";
import SunIcon from "./icons/outlined/SunIcon";

export default function Layout() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const unreadCount = useUnreadNotificationCount();

  const signOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border/40 px-6 py-4 lg:hidden">
          <AppBrand size="sm" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
            </button>
            <NotificationDropdown />
            <button
              type="button"
              onClick={signOut}
              className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text transition-colors"
              aria-label="Sign out"
            >
              <LogoutIcon className="size-4" />
            </button>
          </div>
        </header>

        <nav
          className="flex gap-1 overflow-x-auto border-b border-border/40 px-4 py-2 lg:hidden scrollbar-hide"
          aria-label="Mobile navigation"
        >
          {mobileNavItems.map((item) => {
            const active = isNavItemActive(pathname, item);
            const isNotifications = item.to === "/notifications";
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? "bg-primary-500/10 text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {item.shortLabel ?? item.label}
                {isNotifications && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary-500 text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto px-4 py-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <ErrorBoundary title="This page encountered an error">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
