"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Logs() {
  const [logs, setLogs] = useState<unknown[]>([]);

  useEffect(() => {
    fetch("/api/logs")
      .then(r => r.json())
      .then(data => setLogs(data.logs || []))
      .catch(console.error);
  }, []);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">System Logs</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Failed Jobs (pg-boss)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] w-full rounded-md border p-4">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No failed jobs found. Everything is running smoothly!</p>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 border rounded-lg bg-destructive/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{log.name}</div>
                      <Badge variant="destructive">FAILED</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Completed: {new Date(log.completedon).toLocaleString()}
                    </div>
                    <div className="bg-background p-2 rounded text-xs font-mono overflow-auto">
                      {JSON.stringify(log.output, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
