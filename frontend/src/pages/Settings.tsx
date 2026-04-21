import { useState } from "react";
import ProfileTab from "./settings/ProfileTab";
import SecurityTab from "./settings/SecurityTab";
import RolesTab from "./settings/RolesTab";
import ProvidersTab from "./settings/ProvidersTab";
import SshKeysTab from "./settings/SshKeysTab";
import SourceControlTab from "./settings/SourceControlTab";
import NotificationChannelsTab from "./settings/NotificationChannelsTab";
import IntegrationsTab from "./settings/IntegrationsTab";
import SecurityRulesTab from "./settings/SecurityRulesTab";

type Tab = "profile" | "security" | "roles" | "providers" | "ssh-keys" | "source-control" | "channels" | "integrations" | "security-rules";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("profile");
  const tabCls = (active: boolean) => `h-9 px-4 text-sm font-medium rounded-[var(--radius-btn)] transition-colors ${active ? "bg-primary-500 text-white" : "text-text-secondary hover:bg-secondary-50"}`;

  return (
    <div>
      <h1 className="text-2xl font-display font-semibold text-text mb-8 tracking-tight">Settings</h1>
      <div className="flex gap-2 mb-6" role="tablist">
        {([["profile", "Profile"], ["security", "Security"], ["roles", "Roles"], ["providers", "Providers"], ["ssh-keys", "SSH Keys"], ["source-control", "Source Control"], ["channels", "Notification Channels"], ["integrations", "Integrations"], ["security-rules", "Security Tools"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={tabCls(tab === key)}>{label}</button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "providers" && <ProvidersTab />}
      {tab === "ssh-keys" && <SshKeysTab />}
      {tab === "source-control" && <SourceControlTab />}
      {tab === "channels" && <NotificationChannelsTab />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "security-rules" && <SecurityRulesTab />}
    </div>
  );
}
