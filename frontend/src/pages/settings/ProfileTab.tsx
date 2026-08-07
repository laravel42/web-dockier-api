import { useState, useEffect } from "react";
import { usersApi, authApi, billingApi } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionsContext";
import { countries } from "@/data/countries";
import { SearchableCombobox } from "@/components/ui/combobox";
import { SettingsField, SettingsTextField } from "@/components/SettingsField";
import Button from "@/components/ui/Button";
import PageLoading from "@/components/ui/PageLoading";
import Alert from "@/components/ui/Alert";
import { getErrorMessage } from "@/utils/errors";
import { emptyBillingDetails, type BillingDetails } from "@/types/billing";

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
              <SettingsTextField id="profile-name" label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              <SettingsTextField id="profile-email" label="Email" type="email" value={email} className="bg-secondary-50 text-text-muted cursor-not-allowed" readOnly />
              <SettingsField id="profile-country" label="Country">
                <SearchableCombobox
                  id="profile-country"
                  value={country}
                  onValueChange={setCountry}
                  options={countries.map(([code, label]) => ({ value: code, label }))}
                  placeholder="Select country"
                  searchPlaceholder="Search countries…"
                />
              </SettingsField>
              <SettingsField id="profile-language" label="Language">
                <SearchableCombobox
                  id="profile-language"
                  value={language}
                  onValueChange={setLanguage}
                  options={languages.map(([code, label]) => ({ value: code, label }))}
                  placeholder="Select language"
                  searchPlaceholder="Search languages…"
                />
              </SettingsField>
              <SettingsField id="profile-timezone" label="Timezone" className="sm:col-span-2">
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
              </SettingsField>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving} loading={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
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
                    <SettingsTextField
                      id="billing-company"
                      label="Company name"
                      type="text"
                      value={billing.companyName}
                      onChange={(e) => setBilling((b) => ({ ...b, companyName: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsTextField
                      id="billing-legal"
                      label="Legal name"
                      type="text"
                      value={billing.legalName}
                      onChange={(e) => setBilling((b) => ({ ...b, legalName: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsTextField
                      id="billing-tax-id"
                      label="Tax / VAT ID"
                      type="text"
                      value={billing.taxId}
                      onChange={(e) => setBilling((b) => ({ ...b, taxId: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsTextField
                      id="billing-email"
                      label="Billing email"
                      type="email"
                      value={billing.billingEmail}
                      onChange={(e) => setBilling((b) => ({ ...b, billingEmail: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsTextField
                      id="billing-address-1"
                      label="Address line 1"
                      type="text"
                      value={billing.addressLine1}
                      onChange={(e) => setBilling((b) => ({ ...b, addressLine1: e.target.value }))}
                      disabled={!canManageBilling}
                      containerClassName="sm:col-span-2"
                    />
                    <SettingsTextField
                      id="billing-address-2"
                      label="Address line 2"
                      type="text"
                      value={billing.addressLine2}
                      onChange={(e) => setBilling((b) => ({ ...b, addressLine2: e.target.value }))}
                      disabled={!canManageBilling}
                      containerClassName="sm:col-span-2"
                    />
                    <SettingsTextField
                      id="billing-city"
                      label="City"
                      type="text"
                      value={billing.city}
                      onChange={(e) => setBilling((b) => ({ ...b, city: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsTextField
                      id="billing-state"
                      label="State / Province"
                      type="text"
                      value={billing.state}
                      onChange={(e) => setBilling((b) => ({ ...b, state: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsTextField
                      id="billing-postal"
                      label="Postal code"
                      type="text"
                      value={billing.postalCode}
                      onChange={(e) => setBilling((b) => ({ ...b, postalCode: e.target.value }))}
                      disabled={!canManageBilling}
                    />
                    <SettingsField id="billing-country" label="Country">
                      <SearchableCombobox
                        id="billing-country"
                        value={billing.country}
                        onValueChange={(value) => setBilling((b) => ({ ...b, country: value }))}
                        options={countries.map(([code, label]) => ({ value: code, label }))}
                        placeholder="Select country"
                        searchPlaceholder="Search countries…"
                        disabled={!canManageBilling}
                      />
                    </SettingsField>
                  </div>
                  {canManageBilling && (
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={billingSaving} loading={billingSaving}>
                        {billingSaving ? "Saving..." : "Save Billing"}
                      </Button>
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
          <Button
            onClick={handleSetup2FA}
            disabled={twoFactorLoading}
            loading={twoFactorLoading}
          >
            {twoFactorLoading ? "Setting up..." : "Setup 2FA"}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <img src={qrCode} alt="Scan this QR code with your authenticator app" className="mx-auto" />
              <p className="text-xs text-text-muted mt-2">
                Or enter manually: <code className="bg-secondary-50 px-2 py-0.5 rounded text-text-secondary">{secret}</code>
              </p>
            </div>
            <form onSubmit={handleEnable2FA} className="space-y-3">
              <SettingsTextField
                id="verify-token"
                label="Verification Code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit code"
                required
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={twoFactorLoading || verifyToken.length !== 6}
                  loading={twoFactorLoading}
                  className="bg-success-500 hover:bg-success-700"
                >
                  {twoFactorLoading ? "Verifying..." : "Enable 2FA"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
