import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { getToken, getUserId, setSession } from "../services/session";
import { usersApi } from "../services/api";

interface UserProfile {
  name: string;
  country: string;
  language: string;
  timezone: string;
}

interface AuthContextType {
  token: string | null;
  userId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
  setUserProfile: (profile: UserProfile) => void;
}

function parseJwtEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.email || null;
  } catch { return null; }
}

function loadProfile(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem("userProfile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  userId: null,
  email: null,
  isAuthenticated: false,
  userProfile: null,
  login: () => {},
  logout: () => {},
  setUserProfile: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getToken());
  const [userId, setUserId] = useState<string | null>(getUserId());
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(loadProfile);

  const login = (newToken: string, newUserId: string) => {
    setSession(newToken, newUserId);
    setToken(newToken);
    setUserId(newUserId);
  };

  const logout = () => {
    // Full wipe on logout: clears the session plus any cached app state
    // (theme, view prefs, badge cache, etc.).
    localStorage.clear();
    sessionStorage.clear();
    setToken(null);
    setUserId(null);
    setUserProfileState(null);
  };

  const setUserProfile = (profile: UserProfile) => {
    sessionStorage.setItem("userProfile", JSON.stringify(profile));
    setUserProfileState(profile);
  };

  // Eagerly fetch user profile on app load when authenticated
  useEffect(() => {
    if (!token || !userId || userProfile) return;
    let cancelled = false;
    usersApi.get(userId).then((u) => {
      if (cancelled) return;
      setUserProfile({
        name: u.name,
        country: u.country || "",
        language: u.language || "en",
        timezone: u.timezone || "UTC",
      });
    }).catch(() => {
      // Silently degrade — profile will show email fallback
    });
    return () => { cancelled = true; };
  }, [token, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        token, userId, email: parseJwtEmail(token), isAuthenticated: !!token,
        userProfile, login, logout, setUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
