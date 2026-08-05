import { useState } from "react";
import { notificationsApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import SettingsModalFooter from "../../components/SettingsModalFooter";
import TechBadge from "../../components/TechBadge";
import { SearchableCombobox } from "../../components/ui/combobox";
import { settingsBadgeCls, settingsCardGridCls, settingsCardInteractiveCls, settingsCardCls } from "../../utils/styles";
import { Input } from "../../components/ui/input";
import Button from "../../components/ui/Button";
import { usePermissions } from "../../context/PermissionsContext";
import PageLoading from "../../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../../components/ui/PageError";
import { useAsyncData } from "../../hooks/useAsyncData";
import { notifyInAppNotificationsChanged } from "../../hooks/useInAppNotificationsEnabled";
import { BellIcon, LinkIcon, MailIcon, PlusIcon } from "lucide-react";

export default function NotificationChannelsTab() {
  const { has } = usePermissions();
  const canManage = has("notification:manage");
  const { data: channels, loading, error, reload } = useAsyncData(
    () => notificationsApi.listChannels().then((res) => res.channels),
    [],
  );
  const channelList = channels ?? [];
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ type: "email", configValue: "" });
  const [editingChannel, setEditingChannel] = useState<{ id: string; type: string; config: Record<string, string>; enabled: boolean } | null>(null);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editConfigValue, setEditConfigValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = reload;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const config: Record<string, string> = {};
    if (formData.type === "email") config.email = formData.configValue;
    else if (formData.type === "slack") config.webhookUrl = formData.configValue;
    else if (formData.type === "webhook") config.url = formData.configValue;
    await notificationsApi.addChannel({ type: formData.type, config });
    setShowForm(false); setFormData({ type: "email", configValue: "" }); fetch_();
  };

  const openEditChannel = (ch: (typeof channelList)[number]) => {
    setEditingChannel(ch);
    setEditEnabled(ch.enabled);
    setEditConfigValue(ch.type === "email" ? ch.config.email || "" : ch.type === "slack" ? ch.config.webhookUrl || "" : ch.type === "webhook" ? ch.config.url || "" : "");
  };

  const handleEditChannelSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    if (editingChannel.enabled !== editEnabled) {
      await notificationsApi.toggleChannel(editingChannel.id, editEnabled);
      if (editingChannel.type === "in_app") {
        notifyInAppNotificationsChanged();
      }
    }
    setEditingChannel(null); fetch_();
  };

  const channelDescriptions: Record<string, string> = {
    email: "Receive deploy and alert notifications via email.",
    slack: "Post notifications to a Slack channel.",
    webhook: "Send notifications to a custom webhook endpoint.",
    in_app: "View notifications directly in the dashboard.",
  };

  const configLabel: Record<string, string> = { email: "Email Address", slack: "Slack Webhook URL", webhook: "Webhook URL", in_app: "No configuration needed" };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Notification Channels</h2>
          <p className="text-sm text-text-muted mt-0.5">Configure where alerts and notifications are delivered.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)} iconLeft={<PlusIcon />}>
            Add Channel
          </Button>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Channel" compact>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="channel-type" className="block text-sm font-medium text-text-secondary mb-1.5">Channel Type</label>
            <SearchableCombobox
              id="channel-type"
              value={formData.type}
              onValueChange={(type) => setFormData({ ...formData, type })}
              options={[
                { value: "email", label: "Email" },
                { value: "slack", label: "Slack" },
                { value: "webhook", label: "Webhook" },
              ]}
              placeholder="Select channel type"
            />
          </div>
          {formData.type !== "in_app" && (
            <div>
              <label htmlFor="channel-config" className="block text-sm font-medium text-text-secondary mb-1.5">{configLabel[formData.type]}</label>
              <Input id="channel-config" type="text" value={formData.configValue} onChange={(e) => setFormData({ ...formData, configValue: e.target.value })} required />
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit">Add Channel</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingChannel} onClose={() => setEditingChannel(null)} title={{ email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" }[editingChannel?.type as string] || editingChannel?.type || "Channel"} size="lg">
        {editingChannel && (() => {
          const chName = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" }[editingChannel.type as string] || editingChannel.type;
          const chIcon = editingChannel.type === "slack" ? <TechBadge name="slack" icon="slack" iconOnly iconSize="w-10 h-10" /> :
            editingChannel.type === "email" ? <MailIcon className="size-10" /> :
            editingChannel.type === "webhook" ? <LinkIcon className="size-10" /> :
            <BellIcon className="size-10" />;
          return (
          <form onSubmit={handleEditChannelSave} className="space-y-5">
            {/* Hero header */}
            <div className="flex items-center gap-5">
              <div className="size-14  rounded-xl flex items-center justify-center shrink-0 text-text-secondary">
                {chIcon}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-text">{chName}</p>
                <p className="text-sm text-text-muted">{channelDescriptions[editingChannel.type] || "Notification channel."}</p>
              </div>
            </div>

            {/* Metadata bar */}
            <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-secondary-50 border border-border text-xs">
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Type</span>
                <p className="text-text font-medium mt-0.5">{chName}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="uppercase tracking-wide text-text-muted font-semibold">Status</span>
                <p className={`font-medium mt-0.5 ${editEnabled ? "text-success-500" : "text-text-muted"}`}>{editEnabled ? "Enabled" : "Disabled"}</p>
              </div>
              <div className="ml-auto">
                <button id="edit-ch-enabled" type="button" onClick={() => setEditEnabled(!editEnabled)}
                  className={`px-4 py-1.5 rounded-(--radius-btn) text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-white hover:bg-primary-600"}`}>
                  {editEnabled ? "Disable" : "Enable"}
                </button>
              </div>
            </div>

            {/* Overview */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
              <p className="text-sm/relaxed text-text-secondary ">{channelDescriptions[editingChannel.type] || "Notification channel."}</p>
            </div>

            {/* Configuration */}
            {editingChannel.type !== "in_app" && (
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                <div>
                  <label htmlFor="edit-ch-config" className="block text-sm font-medium text-text-secondary mb-1.5">{configLabel[editingChannel.type]}</label>
                  <Input id="edit-ch-config" type="text" value={editConfigValue} onChange={(e) => setEditConfigValue(e.target.value)} required />
                </div>
              </div>
            )}

            {/* Footer */}
            <SettingsModalFooter
              onDelete={canManage && editingChannel.type !== "in_app" ? () => setConfirmRemove(true) : undefined}
              deleteAriaLabel={`Remove ${chName} channel`}
            >
              <Button type="submit">Save Changes</Button>
            </SettingsModalFooter>
          </form>
          );
        })()}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingChannel) notificationsApi.deleteChannel(editingChannel.id).then(fetch_); setEditingChannel(null); setConfirmRemove(false); }} message="Are you sure you want to remove this channel?" />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : (
        <div className={settingsCardGridCls}>
          {channelList.map((ch) => {
            const channelNames: Record<string, string> = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" };
            const channelIcons: Record<string, React.ReactNode> = {
              email: <MailIcon className="size-7" />,
              slack: <TechBadge name="slack" icon="slack" iconOnly iconSize="w-7 h-7" />,
              webhook: <LinkIcon className="size-7" />,
              in_app: <BellIcon className="size-7" />,
            };
            return (
            <div key={ch.id} onClick={() => canManage && openEditChannel(ch)} className={canManage ? settingsCardInteractiveCls : settingsCardCls}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="size-8  flex items-center justify-center shrink-0 text-text-secondary">
                    {channelIcons[ch.type] || channelIcons.in_app}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text">{channelNames[ch.type] || ch.type}</p>
                    {ch.type === "in_app" && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Default</span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 ${ch.enabled ? settingsBadgeCls.success : settingsBadgeCls.muted}`}>
                  {ch.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-text-muted">{channelDescriptions[ch.type] || "Notification channel."}</p>
            </div>
            );
          })}
          {channelList.length === 0 && (
            <div className="col-span-full">
              <EmptyMessage>No notification channels configured</EmptyMessage>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
