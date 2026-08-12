import { useEffect, useMemo, useState } from "react";
import { useTabListKeyboard, panelId, tabId } from "../hooks/useTabListKeyboard";
import { usePermissions } from "../context/PermissionsContext";
import PageHeader from "../components/ui/PageHeader";
import PageLoading from "../components/ui/PageLoading";
import ProfileTab from "./settings/ProfileTab";
import UsersTab from "./settings/UsersTab";
import RolesTab from "./settings/RolesTab";
import ProvidersTab from "./settings/ProvidersTab";
import SshKeysTab from "./settings/SshKeysTab";
import SourceControlTab from "./settings/SourceControlTab";
import NotificationChannelsTab from "./settings/NotificationChannelsTab";
import IntegrationsTab from "./settings/IntegrationsTab";
import SecurityRulesTab from "./settings/SecurityRulesTab";

type Tab = "profile" | "users" | "roles" | "providers" | "ssh-keys" | "source-control" | "channels" | "integrations" | "security-rules";

export default function Settings() {
  const { has, loading } = usePermissions();
  const [tab, setTab] = useState<Tab>("profile");

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = useMemo(
    () => [
      { key: "profile", label: "Profile", visible: true },
      { key: "users", label: "Users", visible: has("user:view") || has("user:manage") },
      { key: "roles", label: "Roles", visible: has("role:view") || has("role:manage") },
      { key: "providers", label: "Providers", visible: has("credential:view") || has("credential:manage") },
      { key: "ssh-keys", label: "SSH Keys", visible: has("credential:view") || has("credential:manage") },
      { key: "source-control", label: "Source Control", visible: has("credential:view") || has("credential:manage") },
      { key: "channels", label: "Notification Channels", visible: has("notification:view") || has("notification:manage") },
      { key: "integrations", label: "Integrations", visible: has("credential:view") || has("credential:manage") },
      { key: "security-rules", label: "Security Tools", visible: has("scan:manage") },
    ],
    [has],
  );

  const visibleTabs = useMemo(() => tabs.filter((t) => t.visible), [tabs]);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : (visibleTabs[0]?.key ?? "profile");
  const visibleTabKeys = useMemo(() => visibleTabs.map((t) => t.key), [visibleTabs]);
  const handleTabKeyDown = useTabListKeyboard(visibleTabKeys, setTab);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === tab)) {
      setTab(visibleTabs[0]?.key ?? "profile");
    }
  }, [tab, visibleTabs]);

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

  return (
    <div>
      <PageHeader title="Settings" description="Account, team, and integrations." />
      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={tabId(key)}
            aria-controls={panelId(key)}
            aria-selected={activeTab === key}
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => handleTabKeyDown(e, key)}
            className={tabCls(activeTab === key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId(activeTab)} aria-labelledby={tabId(activeTab)}>
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "roles" && <RolesTab />}
        {activeTab === "providers" && <ProvidersTab />}
        {activeTab === "ssh-keys" && <SshKeysTab />}
        {activeTab === "source-control" && <SourceControlTab />}
        {activeTab === "channels" && <NotificationChannelsTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "security-rules" && <SecurityRulesTab />}
      </div>
    </div>
  );
}
