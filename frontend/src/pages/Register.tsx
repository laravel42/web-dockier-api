import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.register({ email, password, name });
      login(res.token, res.userId);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-[420px] bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card-hover)] p-8 border border-border/50">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center shadow-sm">
            <span className="text-white font-display font-semibold text-sm">S</span>
          </div>
          <span className="text-lg font-display font-semibold text-text tracking-tight">SaaS App</span>
        </div>
        <h1 className="text-xl font-display font-semibold text-text text-center mb-1">Create Account</h1>
        <p className="text-sm text-text-secondary text-center mb-6">Get started with your free account</p>

        {error && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-danger-50 text-danger-500 text-sm" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} required minLength={8} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>
        <p className="text-center text-sm text-text-secondary mt-6">
          Already have an account? <Link to="/login" className="text-primary-500 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
