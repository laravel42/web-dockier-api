"use client";

import {
  Eye,
  EyeOff,
  Globe,
  Mail,
  Plus,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";

import { CopyButton } from "../../components/common/copy-button";

type Integration = {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  iconBgColor: string;
  iconColor: string;
  connected: boolean;
  category: "productivity" | "communication" | "automation";
};

const integrations: Integration[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Send task notifications to Slack channels",
    icon: Zap,
    iconBgColor: "bg-purple-500",
    iconColor: "text-white",
    connected: true,
    category: "communication",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Create tasks from emails",
    icon: Mail,
    iconBgColor: "bg-red-500",
    iconColor: "text-white",
    connected: false,
    category: "communication",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Sync tasks with your calendar",
    icon: Globe,
    iconBgColor: "bg-blue-500",
    iconColor: "text-white",
    connected: true,
    category: "productivity",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect with 5000+ apps",
    icon: Sparkles,
    iconBgColor: "bg-orange-500",
    iconColor: "text-white",
    connected: false,
    category: "automation",
  },
];

export function IntegrationsTab() {
  const [apiKeyRevealed, setApiKeyRevealed] = useState(false);
  const [apiKey] = useState(
    "sk_live_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c4a8d",
  );

  const handleIntegrationToggle = (integrationId: string) => {
    toast.success(`Integration ${integrationId} toggled`);
  };

  const handleGenerateNewKey = () => {
    toast.success("New API key generated");
    console.log("Generating new API key...");
  };

  const displayApiKey = apiKeyRevealed
    ? apiKey
    : `sk_live_${"•".repeat(50)}4a8d`;

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Connected Apps</CardTitle>
              <CardDescription>
                Integrate with your favorite tools
              </CardDescription>
            </div>
            <Button size="sm">
              <Plus className="size-4" />
              Browse all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {integrations.map((integration, index) => (
              <div key={integration.id}>
                {index > 0 && <ItemSeparator />}
                <Item variant="outline" className="border-0">
                  <ItemMedia>
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-lg",
                        integration.iconBgColor,
                      )}
                    >
                      <integration.icon
                        className={cn("size-5", integration.iconColor)}
                      />
                    </div>
                  </ItemMedia>
                  <ItemContent>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{integration.name}</p>
                          {integration.connected && (
                            <Badge variant="outline" className="bg-success/10">
                              Connected
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {integration.description}
                        </p>
                      </div>
                      <Button
                        variant={integration.connected ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleIntegrationToggle(integration.id)}
                      >
                        {integration.connected ? "Disconnect" : "Connect"}
                      </Button>
                    </div>
                  </ItemContent>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Access</CardTitle>
          <CardDescription>Manage your API keys and webhooks</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border p-4">
                <div className="flex-1 overflow-hidden">
                  <p className="mb-2 font-medium">API Key</p>
                  <code className="text-muted-foreground block truncate font-mono text-sm break-all">
                    {displayApiKey}
                  </code>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setApiKeyRevealed(!apiKeyRevealed)}
                    aria-label={
                      apiKeyRevealed ? "Hide API key" : "Reveal API key"
                    }
                  >
                    {apiKeyRevealed ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                  <CopyButton text={apiKey} />
                </div>
              </div>

              <Button variant="outline" onClick={handleGenerateNewKey}>
                <Plus className="size-4" />
                Generate new key
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Configure webhooks for real-time updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <Settings2 className="text-muted-foreground size-12" />
            <p className="text-muted-foreground mt-4 text-sm">
              No webhooks configured yet
            </p>
            <Button variant="outline" size="sm" className="mt-4">
              <Plus className="size-4" />
              Add webhook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
