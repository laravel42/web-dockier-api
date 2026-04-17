import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import NotificationDropdown from "./NotificationDropdown";
import SearchIcon from "./icons/outlined/SearchIcon";
import MoonIcon from "./icons/outlined/MoonIcon";
import SunIcon from "./icons/outlined/SunIcon";

export default function Toolbar() {
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");

  return (
    <header className="h-[72px] bg-card/80 backdrop-blur-sm border-b border-border/80 flex items-center justify-between px-8 shrink-0">
      {/* Search */}
      <div className="relative w-80">
        <SearchIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/80 bg-surface/50 text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all placeholder:text-text-muted"
          aria-label="Search"
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl text-text-secondary hover:bg-secondary-50 hover:text-text transition-colors"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>

        <NotificationDropdown />
      </div>
    </header>
  );
}
