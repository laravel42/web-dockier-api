import { useState } from "react";
import { notificationsApi } from "@/services/notifications";
import { useAsyncData } from "@/hooks/useAsyncData";
import { Input } from "@/components/ui/input";
import { SectionTitle, SettingsRow, TabSpinner } from "./shared";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

interface Props {
  canManage: boolean;
}

export default function NotificationsSection({ canManage }: Props) {
  const [deployHook, setDeployHook] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [failureEmail, setFailureEmail] = useState("");

  const { data: channels, loading } = useAsyncData(
    () => notificationsApi.listChannels(),
    [],
  );

  const slackEnabled = channels?.channels.some((c) => c.type === "slack" && c.enabled) ?? false;
  const discordEnabled = channels?.channels.some((c) => c.type === "discord" && c.enabled) ?? false;

  // Local overrides for toggle interactions (optimistic UI)
  const [slackOverride, setSlackOverride] = useState<boolean | null>(null);
  const [discordOverride, setDiscordOverride] = useState<boolean | null>(null);

  if (loading) return <TabSpinner label="Loading notifications…" />;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle title="Notifications" description="Manage your site's notification settings." />

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow label="Deployment failure emails" description="Dockier can notify you by email whenever your site fails to deploy.">
          <Input
            type="email"
            value={failureEmail}
            onChange={(e) => setFailureEmail(e.target.value)}
            disabled={!canManage}
            className="w-48 h-8 text-xs"
            placeholder="you@example.com"
          />
        </SettingsRow>

        <SettingsRow label="Deploy hook" description="A custom URL that we will ping when your site is deployed.">
          <ToggleSwitch checked={deployHook} onChange={setDeployHook} disabled={!canManage} />
        </SettingsRow>

        <SettingsRow label="Slack deployment notifications" description="Enable and configure Slack deployment notifications.">
          <ToggleSwitch checked={slackOverride ?? slackEnabled} onChange={setSlackOverride} disabled={!canManage} />
        </SettingsRow>

        <SettingsRow label="Discord deployment notifications" description="Enable and configure Discord deployment notifications.">
          <ToggleSwitch checked={discordOverride ?? discordEnabled} onChange={setDiscordOverride} disabled={!canManage} />
        </SettingsRow>

        <SettingsRow label="Telegram deployment notifications" description="Enable and configure Telegram deployment notifications." border={false}>
          <ToggleSwitch checked={telegramEnabled} onChange={setTelegramEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>
    </div>
  );
}
