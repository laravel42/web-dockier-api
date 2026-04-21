import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

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
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );
  const [userId, setUserId] = useState<string | null>(
    localStorage.getItem("userId")
  );
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(loadProfile);

  const login = (newToken: string, newUserId: string) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("userId", newUserId);
    setToken(newToken);
    setUserId(newUserId);
  };

  const logout = () => {
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
