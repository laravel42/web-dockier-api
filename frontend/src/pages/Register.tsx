import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import Alert from "../components/ui/Alert";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const { login } = useAuth();
  const { refresh: refreshPermissions } = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (!otpSent) {
        if (cooldownSeconds > 0) {
          throw new Error(`Please wait ${cooldownSeconds}s before requesting another code.`);
        }
        const res = await authApi.startRegistration({
          email,
          displayName: name,
          tenantName: workspaceName.trim() || undefined,
        });
        setOtpSent(true);
        setNotice(res.message);
        setCooldownSeconds(60);
      } else {
        const res = await authApi.verifyRegistration({
          email,
          token: otpToken,
          tenantName: workspaceName.trim() || undefined,
        });
        login(res.session.token, res.session.userId);
        await refreshPermissions();
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      const message = (err as Error).message;
      if (/rate limit/i.test(message)) {
        setCooldownSeconds((value) => (value > 0 ? value : 60));
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-[420px] bg-card rounded-card shadow-(--shadow-card-hover) p-8 border border-border/50">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm">
            <img src="/logo.png" alt="Dockier logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-display font-semibold text-text tracking-tight">Dockier</span>
        </div>
        <h1 className="text-xl font-display font-semibold text-text text-center mb-1">Create Account</h1>
        <p className="text-sm text-text-secondary text-center mb-6">Sign up with secure email OTP verification</p>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
        {notice && <Alert variant="info" className="mb-4">{notice}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              required
              minLength={2}
              disabled={otpSent}
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              required
              disabled={otpSent}
            />
          </div>
          <div>
            <label htmlFor="workspace-name" className="block text-sm font-medium text-text-secondary mb-1.5">Workspace name (optional)</label>
            <input
              id="workspace-name"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className={inputCls}
              placeholder={`${name || "Your"} workspace`}
              disabled={otpSent}
            />
          </div>
          {otpSent && (
            <div>
              <label htmlFor="otp-token" className="block text-sm font-medium text-text-secondary mb-1.5">OTP code</label>
              <input
                id="otp-token"
                type="text"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value)}
                className={inputCls}
                required
                minLength={4}
                autoComplete="one-time-code"
              />
            </div>
          )}
          <button type="submit" disabled={loading || (!otpSent && cooldownSeconds > 0)}
            className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-(--radius-btn) hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {loading
              ? "Please wait..."
              : otpSent
                ? "Verify and continue"
                : cooldownSeconds > 0
                  ? `Retry in ${cooldownSeconds}s`
                  : "Send verification code"}
          </button>
        </form>
        <p className="text-center text-sm text-text-secondary mt-6">
          Already have an account? <Link to="/login" className="text-primary-500 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
