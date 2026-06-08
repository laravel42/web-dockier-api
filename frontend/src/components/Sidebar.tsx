import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import type { ReactNode } from "react";
import DashboardIcon from "./icons/outlined/DashboardIcon";
import FolderIcon from "./icons/outlined/FolderIcon";
import UploadIcon from "./icons/outlined/UploadIcon";
import ShieldCheckIcon from "./icons/outlined/ShieldCheckIcon";
import SettingsIcon from "./icons/outlined/SettingsIcon";
import LogoutIcon from "./icons/outlined/LogoutIcon";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const iconCls = "w-[18px] h-[18px] shrink-0 opacity-80";

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <DashboardIcon className={iconCls} /> },
  { to: "/projects", label: "Projects", icon: <FolderIcon className={iconCls} /> },
  { to: "/deploy", label: "Deployments", icon: <UploadIcon className={iconCls} /> },
  { to: "/security", label: "Security Scan", icon: <ShieldCheckIcon className={iconCls} /> },
  { to: "/settings", label: "Settings", icon: <SettingsIcon className={iconCls} /> },
];

export default function Sidebar() {
  const { logout, userProfile } = useAuth();
  const { roleName } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="w-[260px] bg-sidebar border-r border-border/80 flex flex-col shrink-0">
      <div className="h-[72px] flex items-center px-6 border-b border-border/80">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Dockier logo" className="size-9  rounded-xl shadow-sm" />
          <span className="text-2xl font-display font-semibold text-text tracking-tight">Dockier</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200 ${
                active
                  ? "bg-sidebar-active text-primary-300 shadow-sm"
                  : "text-text-secondary hover:bg-secondary-50/80 hover:text-text"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border/80">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary-50/50">
          <div className="size-9  rounded-xl bg-primary-100 flex items-center justify-center">
            <span className="text-primary-600 text-sm font-semibold">{(userProfile?.name || "U")[0].toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{userProfile?.name || "User"}</p>
            <p className="text-xs text-text-muted">{roleName || "Member"}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md text-text-muted hover:text-danger-500 hover:bg-danger-50 transition-colors"
            aria-label="Logout"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
