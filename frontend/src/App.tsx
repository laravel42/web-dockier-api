import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { PermissionsProvider } from "./context/PermissionsContext";
import { ToastProvider } from "./context/ToastContext";
import { ScanProgressProvider } from "./context/ScanProgressContext";
import SessionHandler from "./components/SessionHandler";
import Layout from "./components/Layout";
import PermissionRoute from "./components/PermissionRoute";
import PageLoading from "./components/ui/PageLoading";

// ─── Lazy-loaded page chunks ───────────────────────────────────────
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Deploy = lazy(() => import("./pages/Deploy"));
const DeployDetail = lazy(() => import("./pages/DeployDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Projects = lazy(() => import("./pages/Projects/index"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const SecurityScans = lazy(() => import("./pages/SecurityScans/index"));
const ScanDetail = lazy(() => import("./pages/ScanDetail/index"));

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <PermissionsProvider>
            <ScanProgressProvider>
            <BrowserRouter>
              <SessionHandler />
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/auth/callback/:provider" element={<AuthCallback />} />
                  <Route
                    element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:projectId" element={<ProjectDetail />} />
                    <Route path="/security" element={<SecurityScans />} />
                    <Route element={<ScanDetail />}>
                      <Route path="/security/project/:projectId" />
                      <Route path="/security/:scanId" />
                    </Route>
                    <Route
                      path="/deploy"
                      element={
                        <PermissionRoute permission="deploy:view">
                          <Deploy />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/deploy/:deployId"
                      element={
                        <PermissionRoute permission="deploy:view">
                          <DeployDetail />
                        </PermissionRoute>
                      }
                    />
                    <Route path="/settings" element={<Settings />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            </ScanProgressProvider>
          </PermissionsProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
