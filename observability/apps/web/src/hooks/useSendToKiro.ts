import { useState, useCallback } from "react";
import type { LogEntry } from "@observability/types";

export function useSendToKiro() {
  const [isSending, setIsSending] = useState(false);
  const [lastSentPath, setLastSentPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendToKiro = useCallback(
    async (entries: LogEntry[], description?: string): Promise<string> => {
      setIsSending(true);
      setError(null);
      try {
        const response = await fetch("http://localhost:3000/api/kiro-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries,
            metadata: {
              exportedAt: Date.now(),
              count: entries.length,
              source: "observability",
              description,
            },
          }),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error ?? "Failed to send to Kiro");
        }
        const result = await response.json();
        setLastSentPath(result.filePath);
        return result.filePath;
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [],
  );

  return { sendToKiro, isSending, lastSentPath, error };
}
