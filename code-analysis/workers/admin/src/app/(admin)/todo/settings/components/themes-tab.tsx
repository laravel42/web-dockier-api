"use client";

import { RotateCcw } from "lucide-react";

import { ThemePresetSelector } from "@/components/theme-preset-selector";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTodoDisplayPrefs } from "../../contexts/todo-display-prefs-context";
import type {
  Density,
  FontDisplay,
  FontSize,
  FontText,
} from "../../lib/config/display";

export function ThemesTab() {
  const { prefs, setPrefs, resetPrefs, hydrated } = useTodoDisplayPrefs();

  if (!hydrated) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose the color theme and mode. The same controls live in the app
            header.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-border divide-y">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm leading-none font-medium">Mode</p>
              <p className="text-muted-foreground text-xs">
                Switch between light and dark.
              </p>
            </div>
            <ThemeSwitch
              triggerVariant="outline"
              triggerSize="default"
              triggerClassName="size-9 scale-100 rounded-lg"
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm leading-none font-medium">Color theme</p>
              <p className="text-muted-foreground text-xs">
                Pick a preset palette. Persists across the dashboard.
              </p>
            </div>
            <ThemePresetSelector align="end" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display Options</CardTitle>
          <CardDescription>
            Fine-tune how todo content is displayed. Scoped to the todo app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="font-display">
                Font display (headings)
              </FieldLabel>
              <Select
                value={prefs.fontDisplay}
                onValueChange={(value) =>
                  setPrefs({ fontDisplay: value as FontDisplay })
                }
              >
                <SelectTrigger id="font-display">
                  <SelectValue placeholder="Select display font" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geist-sans">
                    Geist Sans (Default)
                  </SelectItem>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="roboto">Roboto</SelectItem>
                  <SelectItem value="source-sans">Source Sans 3</SelectItem>
                  <SelectItem value="playfair">
                    Playfair Display (Serif)
                  </SelectItem>
                  <SelectItem value="lora">Lora (Serif)</SelectItem>
                  <SelectItem value="merriweather">
                    Merriweather (Serif)
                  </SelectItem>
                  <SelectItem value="geist-mono">Geist Mono</SelectItem>
                  <SelectItem value="roboto-mono">Roboto Mono</SelectItem>
                  <SelectItem value="space-mono">Space Mono</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="font-text">Font text (body)</FieldLabel>
              <Select
                value={prefs.fontText}
                onValueChange={(value) =>
                  setPrefs({ fontText: value as FontText })
                }
              >
                <SelectTrigger id="font-text">
                  <SelectValue placeholder="Select text font" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geist-sans">
                    Geist Sans (Default)
                  </SelectItem>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="roboto">Roboto</SelectItem>
                  <SelectItem value="source-sans">Source Sans 3</SelectItem>
                  <SelectItem value="lora">Lora (Serif)</SelectItem>
                  <SelectItem value="merriweather">
                    Merriweather (Serif)
                  </SelectItem>
                  <SelectItem value="geist-mono">Geist Mono</SelectItem>
                  <SelectItem value="roboto-mono">Roboto Mono</SelectItem>
                  <SelectItem value="space-mono">Space Mono</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="font-size">Font size</FieldLabel>
              <Select
                value={prefs.fontSize}
                onValueChange={(value) =>
                  setPrefs({ fontSize: value as FontSize })
                }
              >
                <SelectTrigger id="font-size">
                  <SelectValue placeholder="Select font size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="density">Content density</FieldLabel>
              <Select
                value={prefs.density}
                onValueChange={(value) =>
                  setPrefs({ density: value as Density })
                }
              >
                <SelectTrigger id="density">
                  <SelectValue placeholder="Select density" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <Button
            variant="outline"
            size="sm"
            onClick={resetPrefs}
            className="mt-4 w-full"
          >
            <RotateCcw className="size-4" />
            Reset Display Options
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
