import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Spinner from "../components/Spinner";

export default function AuthCallback() {
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const code = searchParams.get("code");
  const missingAuth = !code || !provider;

  useEffect(() => {
    if (missingAuth) return;

    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    authApi.socialLogin({ provider, code, redirectUri })
      .then((res) => { login(res.token, res.userId); navigate("/dashboard"); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Authentication failed");
      });
  }, [missingAuth, code, provider, login, navigate]);

  if (missingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger-500 mb-4" role="alert">Missing authorization code</p>
          <a href="/login" className="text-primary-500 font-medium hover:underline text-sm">Back to login</a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger-500 mb-4" role="alert">{error}</p>
          <a href="/login" className="text-primary-500 font-medium hover:underline text-sm">Back to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-8 " />
        <p className="text-text-secondary text-sm">Authenticating...</p>
      </div>
    </div>
  );
}
