import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/useToast";
import { onSessionExpired } from "../services/session";

/** Redirects to login and clears auth when the API returns 401. */
export default function SessionHandler() {
  const { logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    return onSessionExpired(() => {
      if (!isAuthenticated && !localStorage.getItem("token")) return;
      logout();
      toast.error("Your session expired. Please sign in again.");
      navigate("/login", { replace: true });
    });
  }, [logout, navigate, toast, isAuthenticated]);

  return null;
}
