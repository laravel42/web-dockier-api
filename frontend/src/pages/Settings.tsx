import { useState } from "react";
import { usePermissions } from "../context/PermissionsContext";
import PageHeader from "../components/ui/PageHeader";
import PageLoading from "../components/ui/PageLoading";
import ProfileTab from "./settings/ProfileTab";
import SecurityTab from "./settings/SecurityTab";
import UsersTab from "./settings/UsersTab";
import RolesTab from "./settings/RolesTab";
import ProvidersTab from "./settings/ProvidersTab";
import SshKeysTab from "./settings/SshKeysTab";
import SourceControlTab from "./settings/SourceControlTab";
import NotificationChannelsTab from "./settings/NotificationChannelsTab";
import IntegrationsTab from "./settings/IntegrationsTab";
import SecurityRulesTab from "./settings/SecurityRulesTab";

type Tab = "profile" | "security" | "users" | "roles" | "providers" | "ssh-keys" | "source-control" | "channels" | "integrations" | "security-rules";

export default function Settings() {
  const { has, loading } = usePermissions();
  const [tab, setTab] = useState<Tab>("profile");

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" description="Account, team, and integrations." />
        <PageLoading />
      </div>
    );
  }

  const tabCls = (active: boolean) =>
    `h-9 px-4 text-sm font-medium rounded-md transition-colors ${
      active ? "bg-primary-500/10 text-text" : "text-text-muted hover:bg-card/60 hover:text-text"
    }`;

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: "profile", label: "Profile", visible: true },
    { key: "security", label: "Security", visible: true },
    { key: "users", label: "Users", visible: has("user:view") || has("user:manage") },
    { key: "roles", label: "Roles", visible: has("role:view") || has("role:manage") },
    { key: "providers", label: "Providers", visible: has("credential:view") || has("credential:manage") },
    { key: "ssh-keys", label: "SSH Keys", visible: has("credential:view") || has("credential:manage") },
    { key: "source-control", label: "Source Control", visible: has("credential:view") || has("credential:manage") },
    { key: "channels", label: "Notification Channels", visible: has("notification:view") || has("notification:manage") },
    { key: "integrations", label: "Integrations", visible: has("credential:view") || has("credential:manage") },
    { key: "security-rules", label: "Security Tools", visible: has("scan:manage") },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="Account, team, and integrations." />
      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {tabs.filter((t) => t.visible).map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={tabCls(tab === key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "users" && <UsersTab />}
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
