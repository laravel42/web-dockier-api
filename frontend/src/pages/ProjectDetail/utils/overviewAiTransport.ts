import { DefaultChatTransport } from "ai";
import { getToken } from "@/services/session";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export function createOverviewAiTransport() {
  return new DefaultChatTransport({
    api: `${API_BASE}/projects/overview-ai/chat`,
    headers: () => {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
    },
  });
}
