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
    <header className="h-[72px] bg-dusk-900/40 light:bg-cream-50/80 backdrop-blur-xl border-b border-white/8 light:border-cream-200 flex items-center justify-between px-8 shrink-0">
      <div className="relative w-80">
        <SearchIcon className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-dusk-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full h-10 pl-10 pr-4 rounded-(--radius-md) border border-dusk-600 light:border-cream-200 bg-white/4 light:bg-white text-text text-sm outline-none transition-all placeholder:text-text-muted focus:border-dockier-500 focus:ring-[3px] focus:ring-dockier-500/20"
          aria-label="Search"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl text-text-secondary hover:bg-dockier-600/10 hover:text-text transition-colors"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>

        <NotificationDropdown />
      </div>
    </header>
  );
}
