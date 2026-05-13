import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const { login } = useAuth();
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
        const res = await authApi.startPasswordless({ email });
        setOtpSent(true);
        setNotice(res.message);
        setCooldownSeconds(60);
      } else {
        const res = await authApi.verifyPasswordless({
          email,
          token: otpToken,
          type: "email",
        });
        login(res.session.token, res.session.userId);
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

  const resetFlow = () => {
    setOtpSent(false);
    setOtpToken("");
    setError("");
    setNotice("");
  };

  const handleDemoLogin = async () => {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await authApi.demoLogin();
      login(res.session.token, res.session.userId);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-105 bg-card rounded-card shadow-(--shadow-card-hover) p-8 border border-border/50">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm">
            <img src="/logo.png" alt="Dockier logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-display font-semibold text-text tracking-tight">Dockier</span>
        </div>
        <h1 className="text-xl font-display font-semibold text-text text-center mb-1">Welcome back</h1>
        <p className="text-sm text-text-secondary text-center mb-6">
          {otpSent ? "Enter the code sent to your email" : "Sign in with a secure email code"}
        </p>

        {error && <div className="mb-4 p-3 rounded-(--radius-btn) bg-danger-50 text-danger-500 text-sm" role="alert">{error}</div>}
        {notice && <div className="mb-4 p-3 rounded-(--radius-btn) bg-primary-50 text-primary-700 text-sm" role="status">{notice}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 rounded-(--radius-input) border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
              required
              disabled={otpSent}
            />
          </div>
          {otpSent && (
            <div>
              <label htmlFor="otp-token" className="block text-sm font-medium text-text-secondary mb-1.5">Email code</label>
              <input
                id="otp-token"
                type="text"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value)}
                className="w-full h-11 px-4 rounded-(--radius-input) border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all"
                placeholder="Enter code"
                minLength={4}
                required
                autoComplete="one-time-code"
              />
            </div>
          )}
          <button type="submit" disabled={loading || (!otpSent && cooldownSeconds > 0)}
            className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-(--radius-btn) hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {loading
              ? "Please wait..."
              : otpSent
                ? "Verify and sign in"
                : cooldownSeconds > 0
                  ? `Retry in ${cooldownSeconds}s`
                  : "Send sign-in code"}
          </button>
          {otpSent && (
            <button
              type="button"
              onClick={resetFlow}
              className="w-full h-11 border border-border text-text text-sm font-medium rounded-(--radius-btn) hover:bg-surface transition-colors"
            >
              Use a different email
            </button>
          )}
        </form>
        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={loading}
          className="w-full h-11 mt-3 border border-primary-400 text-primary-600 text-sm font-medium rounded-(--radius-btn) hover:bg-primary-50 disabled:opacity-50 transition-colors"
        >
          Continue in demo mode
        </button>

        <p className="text-center text-sm text-text-secondary mt-6">
          Need an account? <Link to="/register" className="text-primary-500 font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
