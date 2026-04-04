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

  const handleSocialLogin = (provider: "github" | "gitlab" | "bitbucket") => {
    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    const url =
      provider === "gitlab"
        ? `https://gitlab.com/oauth/authorize?client_id=YOUR_GITLAB_CLIENT_ID&redirect_uri=${redirectUri}&response_type=code&scope=read_user`
        : provider === "bitbucket"
        ? `https://bitbucket.org/site/oauth2/authorize?client_id=YOUR_BITBUCKET_CLIENT_ID&redirect_uri=${redirectUri}&response_type=code`
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
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm">
            <img src="/logo.png" alt="Dockier logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-display font-semibold text-text tracking-tight">Dockier</span>
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
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 pr-11 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
                required />
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
            className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-text-muted">Or continue with</span></div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => handleSocialLogin("github")}
            className="h-10 flex items-center justify-center gap-2 rounded-[var(--radius-btn)] text-sm text-white font-medium bg-[#24292f] hover:bg-[#1b1f23] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </button>
          <button type="button" onClick={() => handleSocialLogin("gitlab")}
            className="h-10 flex items-center justify-center gap-2 rounded-[var(--radius-btn)] text-sm text-white font-medium transition-colors" style={{ backgroundColor: "#fc6d26" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#e24329")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fc6d26")}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.382.865.865 0 0 0-.994.053.854.854 0 0 0-.29.41l-2.21 6.773H7.53L5.32 1.06a.857.857 0 0 0-.29-.41.865.865 0 0 0-.994-.052.851.851 0 0 0-.336.381L.433 9.507l-.033.086a6.066 6.066 0 0 0 2.012 7.01l.01.008.028.02 4.98 3.727 2.462 1.863 1.5 1.132a1.012 1.012 0 0 0 1.22 0l1.5-1.132 2.462-1.863 5.008-3.748.012-.01a6.068 6.068 0 0 0 2.009-7.007z"/></svg>
            GitLab
          </button>
          <button type="button" onClick={() => handleSocialLogin("bitbucket")}
            className="h-10 flex items-center justify-center gap-2 rounded-[var(--radius-btn)] text-sm text-white font-medium bg-[#0052cc] hover:bg-[#0747a6] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z"/></svg>
            Bitbucket
          </button>
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Don't have an account? <Link to="/register" className="text-primary-500 font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
