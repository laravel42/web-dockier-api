import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFAToken, setTwoFAToken] = useState("");
  const [pending2FA, setPending2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      if (res.requires2FA) {
        setPending2FA(true);
        setPendingUserId(res.userId);
      } else {
        login(res.token, res.userId);
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.verify2FA({ userId: pendingUserId, token: twoFAToken });
      login(res.token, res.userId);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: "google" | "github") => {
    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    const url =
      provider === "google"
        ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_GOOGLE_CLIENT_ID&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile`
        : `https://github.com/login/oauth/authorize?client_id=YOUR_GITHUB_CLIENT_ID&redirect_uri=${redirectUri}&scope=user:email`;
    window.location.href = url;
  };

  if (pending2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-full max-w-[420px] bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card-hover)] p-8 border border-border/50">
          <h1 className="text-xl font-display font-semibold text-text text-center mb-2">Two-Factor Authentication</h1>
          <p className="text-sm text-text-secondary text-center mb-6">Enter the code from your authenticator app</p>
          {error && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-danger-50 text-danger-500 text-sm" role="alert">{error}</div>}
          <form onSubmit={handleVerify2FA} className="space-y-5">
            <div>
              <label htmlFor="twofa-token" className="block text-sm font-medium text-text-secondary mb-1.5">Authentication Code</label>
              <input id="twofa-token" type="text" value={twoFAToken} onChange={(e) => setTwoFAToken(e.target.value)}
                className="w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
                placeholder="Enter 6-digit code" required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-[420px] bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card-hover)] p-8 border border-border/50">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center shadow-sm">
            <span className="text-white font-display font-semibold text-sm">S</span>
          </div>
          <span className="text-lg font-display font-semibold text-text tracking-tight">SaaS App</span>
        </div>
        <h1 className="text-xl font-display font-semibold text-text text-center mb-1">Welcome back</h1>
        <p className="text-sm text-text-secondary text-center mb-6">Sign in to continue to your dashboard</p>

        {error && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-danger-50 text-danger-500 text-sm" role="alert">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
              required />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
              required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-text-muted">Or continue with</span></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => handleSocialLogin("google")}
            className="h-10 flex items-center justify-center gap-2 border border-border rounded-[var(--radius-btn)] text-sm text-text-secondary hover:bg-secondary-50 transition-colors">
            Google
          </button>
          <button type="button" onClick={() => handleSocialLogin("github")}
            className="h-10 flex items-center justify-center gap-2 border border-border rounded-[var(--radius-btn)] text-sm text-text-secondary hover:bg-secondary-50 transition-colors">
            GitHub
          </button>
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Don't have an account? <Link to="/register" className="text-primary-500 font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
