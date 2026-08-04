import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi } from "../services/api";
import { useAuth } from "./AuthContext";

interface PermissionsContextValue {
  permissions: Set<string>;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  loading: boolean;
  has: (permission: string) => boolean;
  hasAny: (...permissions: string[]) => boolean;
  hasAll: (...permissions: string[]) => boolean;
  refresh: () => void;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: new Set(),
  roleId: "",
  roleName: "",
  isOwner: false,
  loading: true,
  has: () => false,
  hasAny: () => false,
  hasAll: () => false,
  refresh: () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!token) {
      setPermissions(new Set());
      setRoleId("");
      setRoleName("");
      setIsOwner(false);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const me = await authApi.getMe();
      setRoleId(me.roleId ?? "");
      setRoleName(me.roleName ?? "");
      setIsOwner(me.isOwner ?? false);
      setPermissions(new Set(me.permissions ?? []));
    } catch {
      setPermissions(new Set());
      setRoleName("");
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Re-fetch permissions whenever the token changes (login, tenant switch, logout)
  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const has = useCallback((p: string) => {
    if (loading) return false;
    return permissions.has(p);
  }, [permissions, loading]);
  const hasAny = useCallback((...ps: string[]) => {
    if (loading) return false;
    return ps.some(p => permissions.has(p));
  }, [permissions, loading]);
  const hasAll = useCallback((...ps: string[]) => {
    if (loading) return false;
    return ps.every(p => permissions.has(p));
  }, [permissions, loading]);

  return (
    <PermissionsContext.Provider value={{ permissions, roleId, roleName, isOwner, loading, has, hasAny, hasAll, refresh: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
