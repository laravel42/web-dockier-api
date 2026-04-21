import { useState, useEffect } from "react";
import { usersApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { countries } from "../../data/countries";
import { inputCls, btnPrimary } from "../../utils/styles";
import Spinner from "../../components/Spinner";

export default function ProfileTab() {
  const { userId, email: authEmail, userProfile, setUserProfile } = useAuth();
  const [name, setName] = useState(userProfile?.name || "");
  const [email, setEmail] = useState(authEmail || "");
  const [country, setCountry] = useState(userProfile?.country || "");
  const [language, setLanguage] = useState(userProfile?.language || "en");
  const [timezone, setTimezone] = useState(userProfile?.timezone || "UTC");
  const [loading, setLoading] = useState(!userProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId || userProfile) { setLoading(false); return; }
    usersApi.get(userId).then((u) => {
      setName(u.name); setEmail(u.email); setCountry(u.country || ""); setLanguage(u.language || "en"); setTimezone(u.timezone || "UTC");
      setUserProfile({ name: u.name, country: u.country || "", language: u.language || "en", timezone: u.timezone || "UTC" });
    }).catch(() => {
      setEmail(authEmail || "");
    }).finally(() => setLoading(false));
  }, [userId, authEmail, userProfile, setUserProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setMessage("");
    try {
      await usersApi.update(userId, { name, country, language, timezone });
      setUserProfile({ name, country, language, timezone });
      setMessage("Profile updated successfully");
    } catch (err: unknown) { setMessage((err as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

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
    <div className="bg-card rounded-(--radius-card) shadow-(--shadow-card) p-6 max-w-lg">
      <h2 className="text-base font-semibold text-text mb-1">Profile</h2>
      <p className="text-sm text-text-secondary mb-5">Manage your personal information.</p>
      {message && <div className="mb-4 p-3 rounded-(--radius-btn) bg-primary-50 text-primary-600 text-sm" role="status">{message}</div>}
      <form onSubmit={handleSave} className="space-y-4">
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
          <select id="profile-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
            {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-language" className="block text-sm font-medium text-text-secondary mb-1.5">Language</label>
          <select id="profile-language" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
            {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-timezone" className="block text-sm font-medium text-text-secondary mb-1.5">Timezone</label>
          <select id="profile-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
            {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
