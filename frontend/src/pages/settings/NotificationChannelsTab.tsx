import { useState, useEffect } from "react";
import { notificationsApi } from "../../services/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import TechBadge from "../../components/TechBadge";
import { inputCls, btnPrimary, btnDanger } from "../../utils/styles";
import { usePermissions } from "../../context/PermissionsContext";
import Spinner from "../../components/Spinner";

export default function NotificationChannelsTab() {
  const { has } = usePermissions();
  const canManage = has("notification:manage");
  const [channels, setChannels] = useState<Array<{ id: string; type: string; config: Record<string, string>; enabled: boolean }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ type: "email", configValue: "" });
  const [loading, setLoading] = useState(true);
  const [editingChannel, setEditingChannel] = useState<{ id: string; type: string; config: Record<string, string>; enabled: boolean } | null>(null);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editConfigValue, setEditConfigValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try { const res = await notificationsApi.listChannels(); setChannels(res.channels); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const config: Record<string, string> = {};
    if (formData.type === "email") config.email = formData.configValue;
    else if (formData.type === "slack") config.webhookUrl = formData.configValue;
    else if (formData.type === "webhook") config.url = formData.configValue;
    await notificationsApi.addChannel({ type: formData.type, config });
    setShowForm(false); setFormData({ type: "email", configValue: "" }); fetch_();
  };

  const openEditChannel = (ch: typeof channels[number]) => {
    setEditingChannel(ch);
    setEditEnabled(ch.enabled);
    setEditConfigValue(ch.type === "email" ? ch.config.email || "" : ch.type === "slack" ? ch.config.webhookUrl || "" : ch.type === "webhook" ? ch.config.url || "" : "");
  };

  const handleEditChannelSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    if (editingChannel.enabled !== editEnabled) {
      await notificationsApi.toggleChannel(editingChannel.id, editEnabled);
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
        <h2 className="text-base font-semibold text-text">Notification Channels</h2>
        {canManage && (
          <button onClick={() => setShowForm(true)} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Channel
          </button>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Channel" compact>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="channel-type" className="block text-sm font-medium text-text-secondary mb-1.5">Channel Type</label>
            <select id="channel-type" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={inputCls}>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
              <option value="in_app">In-App</option>
            </select>
          </div>
          {formData.type !== "in_app" && (
            <div>
              <label htmlFor="channel-config" className="block text-sm font-medium text-text-secondary mb-1.5">{configLabel[formData.type]}</label>
              <input id="channel-config" type="text" value={formData.configValue} onChange={(e) => setFormData({ ...formData, configValue: e.target.value })} className={inputCls} required />
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Add Channel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingChannel} onClose={() => setEditingChannel(null)} title={{ email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" }[editingChannel?.type as string] || editingChannel?.type || "Channel"} size="lg">
        {editingChannel && (() => {
          const chName = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" }[editingChannel.type as string] || editingChannel.type;
          const chIcon = editingChannel.type === "slack" ? <TechBadge name="slack" icon="slack" iconOnly iconSize="w-10 h-10" /> :
            editingChannel.type === "email" ? <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> :
            editingChannel.type === "webhook" ? <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg> :
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>;
          return (
          <form onSubmit={handleEditChannelSave} className="space-y-5">
            {/* Hero header */}
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-text-secondary">
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
                  className={`px-4 py-1.5 rounded-[var(--radius-btn)] text-xs font-medium transition-colors ${editEnabled ? "bg-secondary-200 text-secondary-800 hover:bg-secondary-300" : "bg-primary-500 text-white hover:bg-primary-600"}`}>
                  {editEnabled ? "Disable" : "Enable"}
                </button>
              </div>
            </div>

            {/* Overview */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-1">Overview</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{channelDescriptions[editingChannel.type] || "Notification channel."}</p>
            </div>

            {/* Configuration */}
            {editingChannel.type !== "in_app" && (
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-text">Configuration</h3>
                <div>
                  <label htmlFor="edit-ch-config" className="block text-sm font-medium text-text-secondary mb-1.5">{configLabel[editingChannel.type]}</label>
                  <input id="edit-ch-config" type="text" value={editConfigValue} onChange={(e) => setEditConfigValue(e.target.value)} className={inputCls} required />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button type="button" onClick={() => setConfirmRemove(true)} className={btnDanger}>Remove</button>
              <button type="submit" className={btnPrimary}>Save Changes</button>
            </div>
          </form>
          );
        })()}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { if (editingChannel) notificationsApi.deleteChannel(editingChannel.id).then(fetch_); setEditingChannel(null); setConfirmRemove(false); }} message="Are you sure you want to remove this channel?" />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {channels.map((ch) => {
            const channelNames: Record<string, string> = { email: "Email", slack: "Slack", webhook: "Webhook", in_app: "In-App" };
            const channelIcons: Record<string, React.ReactNode> = {
              email: <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
              slack: <TechBadge name="slack" icon="slack" iconOnly iconSize="w-7 h-7" />,
              webhook: <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>,
              in_app: <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
            };
            return (
            <div key={ch.id} onClick={() => openEditChannel(ch)} className="bg-card border border-border rounded-[var(--radius-card)] p-4 hover:border-primary-500/30 transition-all shadow-[var(--shadow-card)] cursor-pointer">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0 text-text-secondary">
                  {channelIcons[ch.type] || channelIcons.in_app}
                </div>
                <p className="text-sm font-bold text-text">{channelNames[ch.type] || ch.type}</p>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${ch.enabled ? "bg-success-50 text-success-500" : "bg-secondary-100 text-text-muted"}`}>
                {ch.enabled ? "Enabled" : "Disabled"}
              </span>
              <p className="text-xs text-text-muted mt-2">{channelDescriptions[ch.type] || "Notification channel."}</p>
            </div>
            );
          })}
          {channels.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No notification channels configured</p>}
        </div>
      )}
    </div>
  );
}
