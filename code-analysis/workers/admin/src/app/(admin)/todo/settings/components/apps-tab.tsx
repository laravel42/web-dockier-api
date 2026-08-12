"use client";

import { Download } from "lucide-react";
import { FaApple, FaGooglePlay, FaLinux, FaWindows } from "react-icons/fa";
import { SiDebian } from "react-icons/si";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { site } from "@/data/site";

import { GlareCard } from "../../components/aceternity/glare-card";

const downloadData = {
  ios: [{ icon: FaApple, label: "App Store" }],
  android: [
    { icon: FaGooglePlay, label: "Google Play" },
    { icon: Download, label: "APK (Direct)" },
  ],
  windows: [
    { icon: FaWindows, label: "Installer (.exe)" },
    { icon: Download, label: "Portable (.zip)" },
  ],
  mac: [
    { icon: FaApple, label: "DMG" },
    { icon: Download, label: "Universal (.zip)" },
  ],
  linux: [
    { icon: FaLinux, label: "AppImage" },
    { icon: SiDebian, label: "Debian (.deb)" },
    { icon: Download, label: "Tarball (.tar.gz)" },
  ],
};

export function AppsTab() {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="[&>div>div]:border-border [&>div]:aspect-square [&>div]:size-56 sm:[&>div]:size-64">
          <GlareCard className="bg-primary dark:bg-background flex flex-col items-center justify-center">
            <Logo
              src={site.logoDarkSrc}
              width={160}
              height={160}
              alt={site.logoAlt}
              className="size-32 sm:size-40"
            />
          </GlareCard>
        </div>
        <h1 className="text-2xl font-semibold">{site.title}</h1>
      </div>

      <div className="flex flex-col items-center justify-center gap-3">
        <Button size="lg">
          Download (Auto Detect)
          <Download />
        </Button>
        <p className="text-muted-foreground text-sm">
          Last updated September 23, 2025
        </p>
      </div>

      <div className="mx-auto max-w-2xl">
        <div className="border-border divide-border divide-y rounded-lg border">
          {Object.entries(downloadData).map(([platform, variants], idx) => (
            <div key={idx} className="grid grid-cols-2 gap-4 px-4 py-3">
              <span className="text-sm font-medium capitalize">{platform}</span>
              <div className="flex flex-col gap-2">
                {variants.map((variant, idx) => {
                  const IconComponent = variant.icon;
                  return (
                    <Button
                      key={idx}
                      size="sm"
                      variant="outline"
                      className="flex cursor-pointer items-center"
                    >
                      <IconComponent className="size-4" />
                      {variant.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
