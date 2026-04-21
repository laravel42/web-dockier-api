import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [showPassword, setShowPassword] = useState(false);
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
    } catch (err: unknown) {
      setError((err as Error).message);
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
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (pending2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-full max-w-105 bg-card rounded-(--radius-card) shadow-(--shadow-card-hover) p-8 border border-border/50">
          <h1 className="text-xl font-display font-semibold text-text text-center mb-2">Two-Factor Authentication</h1>
          <p className="text-sm text-text-secondary text-center mb-6">Enter the code from your authenticator app</p>
          {error && <div className="mb-4 p-3 rounded-(--radius-btn) bg-danger-50 text-danger-500 text-sm" role="alert">{error}</div>}
          <form onSubmit={handleVerify2FA} className="space-y-5">
            <div>
              <label htmlFor="twofa-token" className="block text-sm font-medium text-text-secondary mb-1.5">Authentication Code</label>
              <input id="twofa-token" type="text" value={twoFAToken} onChange={(e) => setTwoFAToken(e.target.value)}
                className="w-full h-11 px-4 rounded-(--radius-input) border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
                placeholder="Enter 6-digit code" required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-(--radius-btn) hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-105 bg-card rounded-(--radius-card) shadow-(--shadow-card-hover) p-8 border border-border/50">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm">
            <img src="/logo.png" alt="Dockier logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-display font-semibold text-text tracking-tight">Dockier</span>
        </div>
        <h1 className="text-xl font-display font-semibold text-text text-center mb-1">Welcome back</h1>
        <p className="text-sm text-text-secondary text-center mb-6">Sign in to continue to your dashboard</p>

        {error && <div className="mb-4 p-3 rounded-(--radius-btn) bg-danger-50 text-danger-500 text-sm" role="alert">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 rounded-(--radius-input) border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
              required />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 pr-11 rounded-(--radius-input) border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
                autoComplete="current-password" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-(--radius-btn) hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-text-muted font-semibold mt-6">
          Registration is currently disabled.
        </p>
      </div>
    </div>
  );
}
