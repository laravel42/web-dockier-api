import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import Alert from "../components/ui/Alert";
import AuthLayout from "../components/AuthLayout";
import { btnPrimaryAuth, btnLink, inputCls, labelCls } from "../utils/styles";

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

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-semibold text-foreground">Create account</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Sign up with secure email OTP verification
      </p>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {notice && <Alert variant="info" className="mb-4">{notice}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className={labelCls}>
            Name
          </label>
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
            disabled={otpSent}
          />
        </div>
        <div>
          <label htmlFor="workspace-name" className={labelCls}>
            Workspace name (optional)
          </label>
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
            <label htmlFor="otp-token" className={labelCls}>
              OTP code
            </label>
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
        <button
          type="submit"
          disabled={loading || (!otpSent && cooldownSeconds > 0)}
          className={btnPrimaryAuth}
        >
          {loading
            ? "Please wait..."
            : otpSent
              ? "Verify and continue"
              : cooldownSeconds > 0
                ? `Retry in ${cooldownSeconds}s`
                : "Send verification code"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className={btnLink}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
