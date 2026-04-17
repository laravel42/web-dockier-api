import { useState } from "react";
import { authApi } from "../../services/api";
import { inputCls, btnPrimary } from "../../utils/styles";

export default function SecurityTab() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetup2FA = async () => {
    setLoading(true);
    try { const res = await authApi.setup2FA(); setQrCode(res.qrCodeUrl); setSecret(res.secret); }
    catch (err: unknown) { setMessage((err as Error).message); }
    finally { setLoading(false); }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await authApi.enable2FA(verifyToken); setMessage("2FA enabled successfully"); setQrCode(null); setSecret(null); setVerifyToken(""); }
    catch (err: unknown) { setMessage((err as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 max-w-lg">
      <h2 className="text-base font-semibold text-text mb-1">Two-Factor Authentication</h2>
      <p className="text-sm text-text-secondary mb-5">Add an extra layer of security with an authenticator app.</p>
      {message && <div className="mb-4 p-3 rounded-[var(--radius-btn)] bg-primary-50 text-primary-600 text-sm" role="status">{message}</div>}
      {!qrCode ? (
        <button onClick={handleSetup2FA} disabled={loading} className={`${btnPrimary} disabled:opacity-50`}>
          {loading ? "Setting up..." : "Setup 2FA"}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <img src={qrCode} alt="Scan this QR code with your authenticator app" className="mx-auto" />
            <p className="text-xs text-text-muted mt-2">Or enter manually: <code className="bg-secondary-50 px-2 py-0.5 rounded text-text-secondary">{secret}</code></p>
          </div>
          <form onSubmit={handleEnable2FA} className="space-y-3">
            <div>
              <label htmlFor="verify-token" className="block text-sm font-medium text-text-secondary mb-1.5">Verification Code</label>
              <input id="verify-token" type="text" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className={inputCls} placeholder="Enter 6-digit code" required />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="h-9 px-4 bg-success-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-success-700 disabled:opacity-50 transition-colors">
                {loading ? "Verifying..." : "Enable 2FA"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
