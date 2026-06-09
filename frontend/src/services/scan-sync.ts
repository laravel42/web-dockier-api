import type { Scan } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function fetchScanSnapshot(scanId: string): Promise<Scan | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const res = await fetch(`${API_BASE}/code-analysis/scans/${scanId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json() as Promise<Scan>;
}
