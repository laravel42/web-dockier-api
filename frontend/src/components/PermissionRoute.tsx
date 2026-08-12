import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../context/PermissionsContext";
import PageLoading from "./ui/PageLoading";

interface PermissionRouteProps {
  permission: string;
  children: ReactNode;
  redirectTo?: string;
}

export default function PermissionRoute({
  permission,
  children,
  redirectTo = "/dashboard",
}: PermissionRouteProps) {
  const { has, loading } = usePermissions();

  if (loading) {
    return <PageLoading />;
  }

  if (!has(permission)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
