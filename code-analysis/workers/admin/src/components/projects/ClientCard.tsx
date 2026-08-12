"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { Client, ClientStatus } from "@/lib/data/clients";

interface ClientCardProps {
  client: Client;
}

function statusLabel(status: ClientStatus): string {
  if (status === "prospect") return "Prospect";
  if (status === "active") return "Active";
  if (status === "on_hold") return "On hold";
  return "Archived";
}

export function ClientCard({ client }: ClientCardProps) {
  return (
    <section className="space-y-3 py-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium">Client</p>
        <Badge
          variant="outline"
          className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
        >
          {statusLabel(client.status)}
        </Badge>
      </div>
      <div className="space-y-1">
        <Link
          href={`/clients/${client.id}`}
          className="text-foreground text-sm font-medium underline-offset-2 hover:underline"
        >
          {client.name}
        </Link>
        {client.primaryContactName && (
          <p className="text-muted-foreground text-xs">
            {client.primaryContactName}
            {client.primaryContactEmail
              ? ` · ${client.primaryContactEmail}`
              : ""}
          </p>
        )}
        {!client.primaryContactName && client.primaryContactEmail && (
          <p className="text-muted-foreground text-xs">
            {client.primaryContactEmail}
          </p>
        )}
      </div>
    </section>
  );
}
