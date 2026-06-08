import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import Alert from "../components/ui/Alert";
import AuthLayout from "../components/AuthLayout";
import { btnPrimaryAuth, btnSecondaryAuth, btnLink, inputCls, labelCls } from "../utils/styles";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loginMode, setLoginMode] = useState<"otp" | "password">("otp");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
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
      if (loginMode === "password") {
        const res = await authApi.passwordLogin({ email, password });
        login(res.session.token, res.session.userId);
        await refreshPermissions();
        navigate("/dashboard");
      } else if (!otpSent) {
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

  const resetFlow = () => {
    setOtpSent(false);
    setOtpToken("");
    setPassword("");
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
      await refreshPermissions();
      navigate("/dashboard");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-semibold text-foreground">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {loginMode === "password"
          ? "Sign in with your email and password"
          : otpSent
            ? "Enter the code sent to your email"
            : "Sign in with a secure email code"}
      </p>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {notice && <Alert variant="info" className="mb-4">{notice}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className={labelCls}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            required
            disabled={otpSent && loginMode === "otp"}
          />
        </div>
        {loginMode === "password" && (
          <div>
            <label htmlFor="password" className={labelCls}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
              autoComplete="current-password"
            />
          </div>
        )}
        {loginMode === "otp" && otpSent && (
          <div>
            <label htmlFor="otp-token" className={labelCls}>
              Email code
            </label>
            <input
              id="otp-token"
              type="text"
              value={otpToken}
              onChange={(e) => setOtpToken(e.target.value)}
              className={inputCls}
              placeholder="Enter code"
              minLength={4}
              required
              autoComplete="one-time-code"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={loading || (loginMode === "otp" && !otpSent && cooldownSeconds > 0)}
          className={btnPrimaryAuth}
        >
          {loading
            ? "Please wait..."
            : loginMode === "password"
              ? "Sign in"
              : otpSent
                ? "Verify and sign in"
                : cooldownSeconds > 0
                  ? `Retry in ${cooldownSeconds}s`
                  : "Send sign-in code"}
        </button>
        {loginMode === "otp" && otpSent && (
          <button type="button" onClick={resetFlow} className={btnSecondaryAuth}>
            Use a different email
          </button>
        )}
      </form>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setLoginMode(loginMode === "otp" ? "password" : "otp");
            resetFlow();
          }}
          className={btnLink}
        >
          {loginMode === "otp" ? "Sign in with password" : "Sign in with email code"}
        </button>
      </div>
      <button
        type="button"
        onClick={handleDemoLogin}
        disabled={loading}
        className={`${btnSecondaryAuth} mt-3`}
      >
        Continue in demo mode
      </button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link to="/register" className={btnLink}>
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
