import { useState, useEffect } from "react";
import { notificationsApi } from "../services/api";
import Spinner from "../components/Spinner";

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list();
      setNotifications(res.notifications);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Notifications</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-4 flex items-start justify-between border border-border/50 ${!n.read ? "border-l-4 border-l-primary-500" : ""}`}>
              <div>
                <h3 className={`text-sm font-medium ${!n.read ? "text-text" : "text-text-muted"}`}>{n.title}</h3>
                <p className="text-sm text-text-secondary mt-0.5">{n.message}</p>
                <p className="text-xs text-text-muted mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {!n.read && (
                <button onClick={() => notificationsApi.markRead(n.id).then(fetchData)}
                  className="text-xs text-primary-500 hover:text-primary-700 font-medium whitespace-nowrap transition-colors">Mark read</button>
              )}
            </div>
          ))}
          {notifications.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No notifications</p>}
        </div>
      )}
    </div>
  );
}
