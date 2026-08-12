"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function GeneralTab() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    weeklyDigest: true,
    soundEffects: true,
    autoArchive: false,
    smartSuggestions: true,
  });

  const handleSettingToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Configure how you receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Email notifications</FieldTitle>
                <FieldDescription>
                  Receive email updates about your tasks
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={() =>
                  handleSettingToggle("emailNotifications")
                }
              />
            </Field>

            <Separator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Push notifications</FieldTitle>
                <FieldDescription>
                  Get push notifications on your device
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.pushNotifications}
                onCheckedChange={() => handleSettingToggle("pushNotifications")}
              />
            </Field>

            <Separator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Weekly digest</FieldTitle>
                <FieldDescription>
                  Get a weekly summary of your productivity
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.weeklyDigest}
                onCheckedChange={() => handleSettingToggle("weeklyDigest")}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your app experience</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="language">Language</FieldLabel>
              <Select defaultValue="en">
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Select defaultValue="utc">
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utc">UTC (GMT+0)</SelectItem>
                  <SelectItem value="est">Eastern (GMT-5)</SelectItem>
                  <SelectItem value="pst">Pacific (GMT-8)</SelectItem>
                  <SelectItem value="cet">Central Europe (GMT+1)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Separator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Sound effects</FieldTitle>
                <FieldDescription>
                  Play sounds when completing tasks
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.soundEffects}
                onCheckedChange={() => handleSettingToggle("soundEffects")}
              />
            </Field>

            <Separator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Auto-archive completed tasks</FieldTitle>
                <FieldDescription>
                  Automatically archive tasks after 30 days
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.autoArchive}
                onCheckedChange={() => handleSettingToggle("autoArchive")}
              />
            </Field>

            <Separator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Smart suggestions</FieldTitle>
                <FieldDescription>
                  Get AI-powered task suggestions
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.smartSuggestions}
                onCheckedChange={() => handleSettingToggle("smartSuggestions")}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
