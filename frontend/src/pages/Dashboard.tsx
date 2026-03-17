import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  const stats = [
    { label: "Users", value: "23", change: "+12.5%", up: true },
    { label: "Deployments", value: "8", change: "+4.2%", up: true },
    { label: "Notifications", value: "15", change: "-2.1%", up: false },
    { label: "Groups", value: "5", change: "+8.0%", up: true },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 hover:shadow-[var(--shadow-card-hover)] transition-shadow">
            <p className="text-sm text-text-secondary mb-1">{s.label}</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-semibold text-text">{s.value}</p>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                s.up ? "bg-success-50 text-success-500" : "bg-danger-50 text-danger-500"
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 ${s.up ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                {s.change}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-2">Compare to last week</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
        <h2 className="text-base font-semibold text-text mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate("/deploy")}
            className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors">
            New Deployment
          </button>
          <button onClick={() => navigate("/settings")}
            className="h-9 px-4 border border-border text-text-secondary text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-50 transition-colors">
            Connect Repository
          </button>
          <button onClick={() => navigate("/groups")}
            className="h-9 px-4 bg-success-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-success-700 transition-colors">
            Manage Groups
          </button>
        </div>
      </div>
    </div>
  );
}
