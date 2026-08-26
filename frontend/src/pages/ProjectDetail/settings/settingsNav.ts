import type { Project } from "@/types";

export type SettingsSection =
  | "general"
  | "deployments"
  | "environment"
  | "wordpress"
  | "composer"
  | "npm"
  | "notifications";

export const SETTINGS_SECTION_TABS = [
  { key: "settingsGeneral", section: "general", label: "General" },
  { key: "settingsDeployments", section: "deployments", label: "Deploy" },
  { key: "settingsEnvironment", section: "environment", label: "Environment" },
  { key: "settingsWordpress", section: "wordpress", label: "WordPress" },
  { key: "settingsComposer", section: "composer", label: "Composer" },
  { key: "settingsNpm", section: "npm", label: "NPM" },
  { key: "settingsNotifications", section: "notifications", label: "Notifications" },
] as const satisfies ReadonlyArray<{
  key: string;
  section: SettingsSection;
  label: string;
}>;

export type SettingsMainTabKey = (typeof SETTINGS_SECTION_TABS)[number]["key"];

const TAB_BY_SECTION = Object.fromEntries(
  SETTINGS_SECTION_TABS.map((t) => [t.section, t.key]),
) as Record<SettingsSection, SettingsMainTabKey>;

const SECTION_BY_TAB = Object.fromEntries(
  SETTINGS_SECTION_TABS.map((t) => [t.key, t.section]),
) as Record<SettingsMainTabKey, SettingsSection>;

export function isSettingsMainTabKey(key: string): key is SettingsMainTabKey {
  return key in SECTION_BY_TAB;
}

export function settingsSectionForTab(key: string): SettingsSection | null {
  if (!isSettingsMainTabKey(key)) return null;
  return SECTION_BY_TAB[key];
}

export function settingsTabForSection(section: SettingsSection): SettingsMainTabKey {
  return TAB_BY_SECTION[section];
}

/** Settings sections shown in the Configure cluster for this project. */
export function visibleSettingsSectionTabs(project: Project) {
  return SETTINGS_SECTION_TABS.filter(
    (tab) =>
      tab.section !== "wordpress"
      || (project.sourceType === "template" && project.template === "wordpress"),
  );
}

/** Legacy `?tab=settings&section=` deep links → main sidebar tab key. */
export function resolveLegacySettingsTab(
  tab: string | null,
  section: string | null,
): SettingsMainTabKey | null {
  if (tab !== "settings") return null;
  const match = SETTINGS_SECTION_TABS.find((t) => t.section === section);
  return match?.key ?? "settingsGeneral";
}
