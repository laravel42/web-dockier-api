import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, rolesApi } from "../services/api";

interface PermissionsContextValue {
  permissions: Set<string>;
  roleId: string;
  roleName: string;
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
  loading: true,
  has: () => false,
  hasAny: () => false,
  hasAll: () => false,
  refresh: () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    try {
      const me = await authApi.getMe();
      setRoleId(me.roleId);
      if (me.roleId) {
        const role = await rolesApi.get(me.roleId);
        setPermissions(new Set(role.permissions));
        setRoleName(role.name);
      } else {
        // No role assigned — no permissions beyond locked defaults
        setPermissions(new Set());
        setRoleName("");
      }
    } catch {
      setPermissions(new Set());
      setRoleName("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const has = useCallback((p: string) => {
    // If no role assigned, grant all permissions (admin by default)
    if (!loading && permissions.size === 0 && !roleId) return true;
    return permissions.has(p);
  }, [permissions, loading, roleId]);
  const hasAny = useCallback((...ps: string[]) => {
    if (!loading && permissions.size === 0 && !roleId) return true;
    return ps.some(p => permissions.has(p));
  }, [permissions, loading, roleId]);
  const hasAll = useCallback((...ps: string[]) => {
    if (!loading && permissions.size === 0 && !roleId) return true;
    return ps.every(p => permissions.has(p));
  }, [permissions, loading, roleId]);

  return (
    <PermissionsContext.Provider value={{ permissions, roleId, roleName, loading, has, hasAny, hasAll, refresh: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
