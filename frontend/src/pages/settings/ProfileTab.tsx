import { useState, useEffect } from "react";
import { usersApi, authApi, billingApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../context/PermissionsContext";
import { countries } from "../../data/countries";
import { SearchableCombobox } from "../../components/ui/combobox";
import { inputCls, btnPrimary } from "../../utils/styles";
import PageLoading from "../../components/ui/PageLoading";
import Alert from "../../components/ui/Alert";
import { getErrorMessage } from "../../utils/errors";
import { emptyBillingDetails, type BillingDetails } from "../../types/billing";

export default function ProfileTab() {
  const { userId, email: authEmail, userProfile, setUserProfile } = useAuth();
  const { has } = usePermissions();
  const canViewBilling = has("billing:view");
  const canManageBilling = has("billing:manage");
  const [name, setName] = useState(userProfile?.name || "");
  const [email, setEmail] = useState(authEmail || "");
  const [country, setCountry] = useState(userProfile?.country || "");
  const [language, setLanguage] = useState(userProfile?.language || "en");
  const [timezone, setTimezone] = useState(userProfile?.timezone || "UTC");
  const [loading, setLoading] = useState(!userProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageVariant, setMessageVariant] = useState<"error" | "success">("success");

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [twoFactorMessageVariant, setTwoFactorMessageVariant] = useState<"error" | "success" | "info">("info");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  const [billing, setBilling] = useState<BillingDetails>(emptyBillingDetails());
  const [billingLoading, setBillingLoading] = useState(canViewBilling);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingMessageVariant, setBillingMessageVariant] = useState<"error" | "success">("success");

  useEffect(() => {
    if (!userId) return;

    const loadProfile = userProfile
      ? Promise.resolve()
      : usersApi.get(userId).then((u) => {
          setName(u.name);
          setEmail(u.email);
          setCountry(u.country || "");
          setLanguage(u.language || "en");
          setTimezone(u.timezone || "UTC");
          setUserProfile({
            name: u.name,
            country: u.country || "",
            language: u.language || "en",
            timezone: u.timezone || "UTC",
          });
        });

    Promise.all([
      loadProfile.catch((err) => {
        setEmail(authEmail || "");
        setMessage(getErrorMessage(err, "Failed to load profile"));
        setMessageVariant("error");
      }),
      authApi.getMe().then((me) => setTwoFactorEnabled(me.twoFactorEnabled)),
      canViewBilling
        ? billingApi.get().then(setBilling).catch((err) => {
            setBillingMessage(getErrorMessage(err, "Failed to load billing details"));
            setBillingMessageVariant("error");
          })
        : Promise.resolve(),
    ]).finally(() => {
      setLoading(false);
      setBillingLoading(false);
    });
  }, [userId, authEmail, userProfile, setUserProfile, canViewBilling]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setMessage("");
    try {
      await usersApi.update(userId, { name, country, language, timezone });
      setUserProfile({ name, country, language, timezone });
      setMessage("Profile updated successfully");
      setMessageVariant("success");
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, "Failed to update profile"));
      setMessageVariant("error");
    } finally {
      setSaving(false);
    }
  };

  const handleSetup2FA = async () => {
    setTwoFactorLoading(true);
    setTwoFactorMessage("");
    try {
      const res = await authApi.setup2FA();
      setQrCode(res.qrCodeUrl);
      setSecret(res.secret);
    } catch (err: unknown) {
      setTwoFactorMessage(getErrorMessage(err, "Failed to set up 2FA"));
      setTwoFactorMessageVariant("error");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageBilling) return;
    setBillingSaving(true);
    setBillingMessage("");
    try {
      const updated = await billingApi.update(billing);
      setBilling(updated);
      setBillingMessage("Billing details updated successfully");
      setBillingMessageVariant("success");
    } catch (err: unknown) {
      setBillingMessage(getErrorMessage(err, "Failed to update billing details"));
      setBillingMessageVariant("error");
    } finally {
      setBillingSaving(false);
    }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorLoading(true);
    setTwoFactorMessage("");
    try {
      await authApi.enable2FA(verifyToken);
      setTwoFactorEnabled(true);
      setTwoFactorMessage("2FA enabled successfully");
      setTwoFactorMessageVariant("success");
      setQrCode(null);
      setSecret(null);
      setVerifyToken("");
    } catch (err: unknown) {
      setTwoFactorMessage(getErrorMessage(err, "Failed to enable 2FA"));
      setTwoFactorMessageVariant("error");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  if (loading) return <PageLoading />;

  const languages = [
    ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"],
    ["it", "Italian"], ["nl", "Dutch"], ["ru", "Russian"], ["zh", "Chinese"], ["ja", "Japanese"],
    ["ko", "Korean"], ["ar", "Arabic"], ["hi", "Hindi"], ["tr", "Turkish"], ["pl", "Polish"],
  ];

  const timezones = [
    "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
    "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
    "Australia/Sydney", "Pacific/Auckland",
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="space-y-6">
        <div className="bg-card rounded-card shadow-(--shadow-card) p-6">
          <h2 className="text-base font-semibold text-text mb-1">User Data</h2>
          <p className="text-sm text-text-secondary mb-5">Manage your personal information.</p>
          {message && <Alert variant={messageVariant} className="mb-4">{message}</Alert>}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                <input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label htmlFor="profile-email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                <input id="profile-email" type="email" value={email} className={`${inputCls} bg-secondary-50 text-text-muted cursor-not-allowed`} readOnly />
              </div>
              <div>
                <label htmlFor="profile-country" className="block text-sm font-medium text-text-secondary mb-1.5">Country</label>
                <SearchableCombobox
                  id="profile-country"
                  value={country}
                  onValueChange={setCountry}
                  options={countries.map(([code, label]) => ({ value: code, label }))}
                  placeholder="Select country"
                  searchPlaceholder="Search countries…"
                />
              </div>
              <div>
                <label htmlFor="profile-language" className="block text-sm font-medium text-text-secondary mb-1.5">Language</label>
                <SearchableCombobox
                  id="profile-language"
                  value={language}
                  onValueChange={setLanguage}
                  options={languages.map(([code, label]) => ({ value: code, label }))}
                  placeholder="Select language"
                  searchPlaceholder="Search languages…"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="profile-timezone" className="block text-sm font-medium text-text-secondary mb-1.5">Timezone</label>
                <SearchableCombobox
                  id="profile-timezone"
                  value={timezone}
                  onValueChange={setTimezone}
                  options={timezones.map((tz) => ({
                    value: tz,
                    label: tz.replace(/_/g, " "),
                    keywords: [tz],
                  }))}
                  placeholder="Select timezone"
                  searchPlaceholder="Search timezones…"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        {canViewBilling && (
          <div className="bg-card rounded-card shadow-(--shadow-card) p-6">
            <h2 className="text-base font-semibold text-text mb-1">Billing Data</h2>
            <p className="text-sm text-text-secondary mb-5">Organization details used for invoices and receipts.</p>
            {billingLoading ? (
              <PageLoading />
            ) : (
              <>
                {billingMessage && <Alert variant={billingMessageVariant} className="mb-4">{billingMessage}</Alert>}
                <form onSubmit={handleSaveBilling} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="billing-company" className="block text-sm font-medium text-text-secondary mb-1.5">Company name</label>
                      <input
                        id="billing-company"
                        type="text"
                        value={billing.companyName}
                        onChange={(e) => setBilling((b) => ({ ...b, companyName: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-legal" className="block text-sm font-medium text-text-secondary mb-1.5">Legal name</label>
                      <input
                        id="billing-legal"
                        type="text"
                        value={billing.legalName}
                        onChange={(e) => setBilling((b) => ({ ...b, legalName: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-tax-id" className="block text-sm font-medium text-text-secondary mb-1.5">Tax / VAT ID</label>
                      <input
                        id="billing-tax-id"
                        type="text"
                        value={billing.taxId}
                        onChange={(e) => setBilling((b) => ({ ...b, taxId: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-email" className="block text-sm font-medium text-text-secondary mb-1.5">Billing email</label>
                      <input
                        id="billing-email"
                        type="email"
                        value={billing.billingEmail}
                        onChange={(e) => setBilling((b) => ({ ...b, billingEmail: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="billing-address-1" className="block text-sm font-medium text-text-secondary mb-1.5">Address line 1</label>
                      <input
                        id="billing-address-1"
                        type="text"
                        value={billing.addressLine1}
                        onChange={(e) => setBilling((b) => ({ ...b, addressLine1: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="billing-address-2" className="block text-sm font-medium text-text-secondary mb-1.5">Address line 2</label>
                      <input
                        id="billing-address-2"
                        type="text"
                        value={billing.addressLine2}
                        onChange={(e) => setBilling((b) => ({ ...b, addressLine2: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-city" className="block text-sm font-medium text-text-secondary mb-1.5">City</label>
                      <input
                        id="billing-city"
                        type="text"
                        value={billing.city}
                        onChange={(e) => setBilling((b) => ({ ...b, city: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-state" className="block text-sm font-medium text-text-secondary mb-1.5">State / Province</label>
                      <input
                        id="billing-state"
                        type="text"
                        value={billing.state}
                        onChange={(e) => setBilling((b) => ({ ...b, state: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-postal" className="block text-sm font-medium text-text-secondary mb-1.5">Postal code</label>
                      <input
                        id="billing-postal"
                        type="text"
                        value={billing.postalCode}
                        onChange={(e) => setBilling((b) => ({ ...b, postalCode: e.target.value }))}
                        className={inputCls}
                        disabled={!canManageBilling}
                      />
                    </div>
                    <div>
                      <label htmlFor="billing-country" className="block text-sm font-medium text-text-secondary mb-1.5">Country</label>
                      <SearchableCombobox
                        id="billing-country"
                        value={billing.country}
                        onValueChange={(value) => setBilling((b) => ({ ...b, country: value }))}
                        options={countries.map(([code, label]) => ({ value: code, label }))}
                        placeholder="Select country"
                        searchPlaceholder="Search countries…"
                        disabled={!canManageBilling}
                      />
                    </div>
                  </div>
                  {canManageBilling && (
                    <div className="flex justify-end pt-2">
                      <button type="submit" disabled={billingSaving} className={`${btnPrimary} disabled:opacity-50`}>
                        {billingSaving ? "Saving..." : "Save Billing"}
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-card rounded-card shadow-(--shadow-card) p-6">
        <h2 className="text-base font-semibold text-text mb-1">Two-Factor Authentication</h2>
        <p className="text-sm text-text-secondary mb-5">Add an extra layer of security with an authenticator app.</p>
        {twoFactorMessage && <Alert variant={twoFactorMessageVariant} className="mb-4">{twoFactorMessage}</Alert>}
        {twoFactorEnabled ? (
          <Alert variant="success">Two-factor authentication is enabled on your account.</Alert>
        ) : !qrCode ? (
          <button
            type="button"
            onClick={handleSetup2FA}
            disabled={twoFactorLoading}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {twoFactorLoading ? "Setting up..." : "Setup 2FA"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <img src={qrCode} alt="Scan this QR code with your authenticator app" className="mx-auto" />
              <p className="text-xs text-text-muted mt-2">
                Or enter manually: <code className="bg-secondary-50 px-2 py-0.5 rounded text-text-secondary">{secret}</code>
              </p>
            </div>
            <form onSubmit={handleEnable2FA} className="space-y-3">
              <div>
                <label htmlFor="verify-token" className="block text-sm font-medium text-text-secondary mb-1.5">Verification Code</label>
                <input
                  id="verify-token"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={inputCls}
                  placeholder="Enter 6-digit code"
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={twoFactorLoading || verifyToken.length !== 6}
                  className="h-9 px-4 bg-success-500 text-white text-sm font-medium rounded-(--radius-btn) hover:bg-success-700 disabled:opacity-50 transition-colors"
                >
                  {twoFactorLoading ? "Verifying..." : "Enable 2FA"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
