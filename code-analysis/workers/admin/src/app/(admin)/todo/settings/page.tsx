"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense } from "react";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AccountTab } from "./components/account-tab";
import { AppsTab } from "./components/apps-tab";
import { GeneralTab } from "./components/general-tab";
import { IntegrationsTab } from "./components/integrations-tab";
import { SubscriptionTab } from "./components/subscription-tab";
import { ThemesTab } from "./components/themes-tab";

const VALID_TABS = [
  "account",
  "general",
  "subscription",
  "themes",
  "integrations",
  "apps",
] as const;

type TabValue = (typeof VALID_TABS)[number];

function SettingsContent() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(VALID_TABS).withDefault("account"),
  );

  return (
    <>
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="mt-4"
      >
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList className="w-max justify-start">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="themes">Themes</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="apps">Apps</TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionTab />
        </TabsContent>

        <TabsContent value="themes">
          <ThemesTab />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="apps">
          <AppsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
