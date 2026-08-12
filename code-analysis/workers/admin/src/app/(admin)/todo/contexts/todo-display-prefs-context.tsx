"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type Density,
  DISPLAY_PREFERENCES,
  type FontDisplay,
  type FontSize,
  type FontText,
} from "../lib/config/display";

export type TodoDisplayPrefs = {
  fontSize: FontSize;
  density: Density;
  fontText: FontText;
  fontDisplay: FontDisplay;
};

const DEFAULTS: TodoDisplayPrefs = {
  fontSize: DISPLAY_PREFERENCES.FONT_SIZE.DEFAULT as FontSize,
  density: DISPLAY_PREFERENCES.DENSITY.DEFAULT as Density,
  fontText: DISPLAY_PREFERENCES.FONT_TEXT.DEFAULT as FontText,
  fontDisplay: DISPLAY_PREFERENCES.FONT_DISPLAY.DEFAULT as FontDisplay,
};

const KEYS = {
  fontSize: DISPLAY_PREFERENCES.FONT_SIZE.KEY,
  density: DISPLAY_PREFERENCES.DENSITY.KEY,
  fontText: DISPLAY_PREFERENCES.FONT_TEXT.KEY,
  fontDisplay: DISPLAY_PREFERENCES.FONT_DISPLAY.KEY,
} as const;

type Ctx = {
  prefs: TodoDisplayPrefs;
  setPrefs: (updates: Partial<TodoDisplayPrefs>) => void;
  resetPrefs: () => void;
  hydrated: boolean;
};

const TodoDisplayPrefsContext = createContext<Ctx | null>(null);

export function TodoDisplayPrefsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [prefs, setPrefsState] = useState<TodoDisplayPrefs>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefsState({
      fontSize:
        (localStorage.getItem(KEYS.fontSize) as FontSize | null) ??
        DEFAULTS.fontSize,
      density:
        (localStorage.getItem(KEYS.density) as Density | null) ??
        DEFAULTS.density,
      fontText:
        (localStorage.getItem(KEYS.fontText) as FontText | null) ??
        DEFAULTS.fontText,
      fontDisplay:
        (localStorage.getItem(KEYS.fontDisplay) as FontDisplay | null) ??
        DEFAULTS.fontDisplay,
    });
    setHydrated(true);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      hydrated,
      setPrefs: (updates) => {
        setPrefsState((prev) => {
          const next = { ...prev, ...updates };
          if (updates.fontSize !== undefined)
            localStorage.setItem(KEYS.fontSize, next.fontSize);
          if (updates.density !== undefined)
            localStorage.setItem(KEYS.density, next.density);
          if (updates.fontText !== undefined)
            localStorage.setItem(KEYS.fontText, next.fontText);
          if (updates.fontDisplay !== undefined)
            localStorage.setItem(KEYS.fontDisplay, next.fontDisplay);
          return next;
        });
      },
      resetPrefs: () => {
        localStorage.removeItem(KEYS.fontSize);
        localStorage.removeItem(KEYS.density);
        localStorage.removeItem(KEYS.fontText);
        localStorage.removeItem(KEYS.fontDisplay);
        setPrefsState(DEFAULTS);
      },
    }),
    [prefs, hydrated],
  );

  return (
    <TodoDisplayPrefsContext.Provider value={value}>
      {children}
    </TodoDisplayPrefsContext.Provider>
  );
}

export function useTodoDisplayPrefs(): Ctx {
  const ctx = useContext(TodoDisplayPrefsContext);
  if (!ctx) {
    throw new Error(
      "useTodoDisplayPrefs must be used within TodoDisplayPrefsProvider",
    );
  }
  return ctx;
}
