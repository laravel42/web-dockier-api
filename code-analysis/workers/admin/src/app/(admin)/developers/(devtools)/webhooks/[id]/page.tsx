import { format } from "date-fns";
import { Bolt, CalendarCheck, LinkIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { webhookListSchema } from "../data/schema";
import { getWebhookData } from "../data/webhook-data";
import { WebhookDetailActions } from "./components/webhook-detail-actions";
import { WebhookLogsTable } from "./components/webhook-logs-table";
import { WebhookStatusIcon } from "./components/webhook-status-icon";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function WebhookDetailPage({ params }: Props) {
  const id = (await params).id;
  const webhookData = getWebhookData();
  const webhookList = webhookListSchema.parse(webhookData);
  const webhook = webhookList.find((user) => user.id === id);

  if (!webhook) {
    return redirect(`/developers/webhooks`);
  }

  return (
    <main
      id="main-content"
      className="flex w-full flex-1 flex-col gap-2 p-4 sm:p-6"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Webhook</h2>
          <WebhookDetailActions data={webhook} />
        </div>
        <div className="flex flex-col items-stretch sm:flex-row sm:items-start">
          <Specs label="Status">
            <WebhookStatusIcon status={webhook.status === "enabled"} />
            <span className="capitalize">{webhook.status}</span>
          </Specs>

          <Specs label="Type">
            <Bolt size={16} />
            <span className="capitalize">{webhook.authType}</span>
          </Specs>

          <Specs label="Created on">
            <CalendarCheck size={16} />
            <span>{format(webhook.createdAt, "dd MMM, yyyy h:mma")}</span>
          </Specs>

          <Specs label="URL">
            <LinkIcon size={16} />
            <span className="text-sky-700 dark:text-sky-400">
              {webhook.url}
            </span>
          </Specs>
        </div>
      </div>

      <WebhookLogsTable data={webhook.logs} />
    </main>
  );
}

function Specs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border border-b py-2 sm:border-r sm:border-b-0 sm:px-4 sm:py-0 sm:last:border-none">
      <span className="text-muted-foreground text-xs font-bold tracking-tight uppercase">
        {label}
      </span>
      <div className="mt-1 flex items-start gap-2 text-sm font-medium [&>*:first-child]:flex-none">
        {children}
      </div>
    </div>
  );
}
