import { useState, useEffect, useCallback } from "react";
import { notificationsApi } from "@/services/notifications";
import { Input } from "@/components/ui/input";
import { SectionTitle, SettingsRow, TabSpinner } from "./shared";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

interface Props {
  canManage: boolean;
}

export default function NotificationsSection({ canManage }: Props) {
  const [loading, setLoading] = useState(true);
  const [deployHook, setDeployHook] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [failureEmail, setFailureEmail] = useState("");

  const fetchChannels = useCallback(async () => {
    try {
      const res = await notificationsApi.listChannels();
      setSlackEnabled(res.channels.some((c) => c.type === "slack" && c.enabled));
      setDiscordEnabled(res.channels.some((c) => c.type === "discord" && c.enabled));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

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
          <ToggleSwitch checked={slackEnabled} onChange={setSlackEnabled} disabled={!canManage} />
        </SettingsRow>

        <SettingsRow label="Discord deployment notifications" description="Enable and configure Discord deployment notifications.">
          <ToggleSwitch checked={discordEnabled} onChange={setDiscordEnabled} disabled={!canManage} />
        </SettingsRow>

        <SettingsRow label="Telegram deployment notifications" description="Enable and configure Telegram deployment notifications." border={false}>
          <ToggleSwitch checked={telegramEnabled} onChange={setTelegramEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>
    </div>
  );
}
