import { useState, useEffect } from "react";
import { usersApi } from "../services/api";
import ConfirmModal from "../components/ConfirmModal";
import UserFormModal from "../components/UserFormModal";

interface User { id: string; email: string; name: string; avatarUrl?: string; createdAt: string; }

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try { const res = await usersApi.list({ search: search || undefined }); setUsers(res.users); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); fetchUsers(); };

  const handleDelete = async (userId: string) => {
    await usersApi.delete(userId);
    fetchUsers();
  };

  const handleCreate = async (data: { email: string; name: string; country: string; language: string; timezone: string }) => {
    await usersApi.create(data);
    setShowCreate(false);
    fetchUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text">Users</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..."
            aria-label="Search users"
            className="h-9 w-56 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors" />
          <button type="submit" className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors">Search</button>
          <button type="button" onClick={() => setShowCreate(true)} className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors">New User</button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Created</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-secondary-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-text">{user.name}</td>
                  <td className="px-5 py-3.5 text-sm text-text-secondary">{user.email}</td>
                  <td className="px-5 py-3.5 text-sm text-text-secondary">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => setDeleteId(user.id)} className="text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors">Delete</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-text-muted text-sm">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) handleDelete(deleteId); }} message="Are you sure you want to delete this user?" />
      <UserFormModal open={showCreate} onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
    </div>
  );
}
