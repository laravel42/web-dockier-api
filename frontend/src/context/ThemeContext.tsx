import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  /** The user's chosen preference (light | dark | system). */
  preference: ThemePreference;
  /** The resolved applied theme after evaluating system preference. */
  theme: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  /** @deprecated Use setPreference instead. Cycles light→dark→system. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  preference: "system",
  theme: "dark",
  setPreference: () => {},
  toggleTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return getSystemTheme();
  return pref;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
    return "dark";
  });

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  const applyTheme = useCallback((pref: ThemePreference) => {
    const r = resolveTheme(pref);
    setResolved(r);
    document.documentElement.setAttribute("data-theme", r);
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", preference);
    applyTheme(preference);
  }, [preference, applyTheme]);

  // Listen for system theme changes when preference is "system"
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference, applyTheme]);

  const setPreference = (pref: ThemePreference) => setPreferenceState(pref);

  const toggleTheme = () =>
    setPreferenceState((p) => (p === "light" ? "dark" : p === "dark" ? "system" : "light"));

  return (
    <ThemeContext.Provider value={{ preference, theme: resolved, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
