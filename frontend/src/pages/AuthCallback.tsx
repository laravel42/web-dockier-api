import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || !provider) { setError("Missing authorization code"); return; }
    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    authApi.socialLogin({ provider, code, redirectUri })
      .then((res) => { login(res.token, res.userId); navigate("/dashboard"); })
      .catch((err) => setError(err.message));
  }, [provider, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <p className="text-danger-500 mb-4" role="alert">{error}</p>
          <a href="/login" className="text-primary-500 font-medium hover:underline text-sm">Back to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">Authenticating...</p>
      </div>
    </div>
  );
}
