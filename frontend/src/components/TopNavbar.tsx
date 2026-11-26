import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppBrand from "./AppBrand";
import { useInAppNotificationsEnabled } from "../hooks/useInAppNotificationsEnabled";
import NotificationDropdown from "./NotificationDropdown";
import { useTheme } from "../context/ThemeContext";
import { LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, SunMediumIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";

/**
 * Project-centric shell: the brand is the home link (→ Projects, the only
 * top-level destination). Deployments and Security live inside each project;
 * account Settings lives in the profile menu below. There is no center nav —
 * a single item read as unfinished, and the brand already goes home.
 */
export default function TopNavbar() {
  const { logout, email, userProfile } = useAuth();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const { enabled: inAppEnabled } = useInAppNotificationsEnabled();

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
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <AppBrand size="sm" to="/projects" />

        <div className="flex items-center justify-end gap-1">
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
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <SettingsIcon />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className="justify-center text-danger-500 focus:text-danger-500">
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
