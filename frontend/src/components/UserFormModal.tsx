import { useState } from "react";
import Modal from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { email: string; name: string; country: string; language: string; timezone: string }) => void;
}

const inputCls =
  "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";
const selectCls =
  "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors appearance-none cursor-pointer";

const LANGUAGES = [
  { code: "en", name: "English" }, { code: "es", name: "Spanish" }, { code: "fr", name: "French" },
  { code: "de", name: "German" }, { code: "pt", name: "Portuguese" }, { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" }, { code: "ko", name: "Korean" }, { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" }, { code: "it", name: "Italian" }, { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" }, { code: "tr", name: "Turkish" }, { code: "pl", name: "Polish" },
];

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Istanbul",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai", "Australia/Sydney",
  "Pacific/Auckland",
];

export default function UserFormModal({ open, onClose, onSubmit }: Props) {
  const [form, setForm] = useState({ email: "", name: "", country: "", language: "en", timezone: "UTC" });
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    onSubmit(form);
    setForm({ email: "", name: "", country: "", language: "en", timezone: "UTC" });
  };

  const handleClose = () => {
    onClose();
    setForm({ email: "", name: "", country: "", language: "en", timezone: "UTC" });
    setError("");
  };

  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Modal open={open} onClose={handleClose} title="New user">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius-input)] bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="user-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input id="user-name" type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="John Doe" required />
        </div>

        <div>
          <label htmlFor="user-email" className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
          <input id="user-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} placeholder="[email]" required />
        </div>

        <div>
          <label htmlFor="user-country" className="block text-sm font-medium text-text-secondary mb-1.5">Country</label>
          <input id="user-country" type="text" value={form.country} onChange={(e) => set("country", e.target.value)} className={inputCls} placeholder="United States" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="user-language" className="block text-sm font-medium text-text-secondary mb-1.5">Language</label>
            <select id="user-language" value={form.language} onChange={(e) => set("language", e.target.value)} className={selectCls}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="user-timezone" className="block text-sm font-medium text-text-secondary mb-1.5">Timezone</label>
            <select id="user-timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={selectCls}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={!form.name.trim() || !form.email.trim()} className="h-9 px-5 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Create user
          </button>
          <button type="button" onClick={handleClose} className="h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
